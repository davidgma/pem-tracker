/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { dbService } from './database.service';

export interface DropboxAuthConfig {
  appKey: string;
  syncFormat: 'sqlite' | 'sql' | 'both';
  autoSync: boolean;
  syncIntervalSeconds: number;
}

export interface DropboxUser {
  accountId: string;
  name: string;
  email: string;
  profilePhotoUrl?: string;
  country?: string;
  spaceUsed: number;
  spaceTotal: number;
}

export interface DropboxSyncLogEntry {
  id: string;
  timestamp: string;
  type: 'push' | 'pull' | 'merge' | 'info' | 'error';
  title: string;
  details?: string;
}

export type DropboxSyncStatus = 'offline' | 'synced' | 'syncing' | 'conflict' | 'error';

const STORAGE_KEY_AUTH = 'pem_dropbox_auth_session';
const STORAGE_KEY_CONFIG = 'pem_dropbox_config';
const STORAGE_KEY_REMOTE_REV = 'pem_dropbox_remote_rev';
const STORAGE_KEY_PKCE_VERIFIER = 'pem_dropbox_pkce_verifier';

const DEFAULT_APP_KEY = '6r631gswwxvkh40';

export class DropboxService {
  private static instance: DropboxService;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: number | null = null;
  private currentUser: DropboxUser | null = null;
  private syncStatus: DropboxSyncStatus = 'offline';
  private lastSyncedTime: Date | null = null;
  private lastRemoteRev: string | null = null;
  private statusListeners: Set<(status: DropboxSyncStatus) => void> = new Set();
  private historyListeners: Set<() => void> = new Set();
  private autoPushTimer: any = null;
  private pollIntervalTimer: any = null;
  private syncLogs: DropboxSyncLogEntry[] = [];

  private config: DropboxAuthConfig = {
    appKey: DEFAULT_APP_KEY,
    syncFormat: 'sqlite',
    autoSync: true,
    syncIntervalSeconds: 60,
  };

  private constructor() {
    this.loadConfig();
    this.restoreAuthSession();
    this.listenToDatabaseChanges();
  }

  public static getInstance(): DropboxService {
    if (!DropboxService.instance) {
      DropboxService.instance = new DropboxService();
    }
    return DropboxService.instance;
  }

  private loadConfig(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (stored) {
        this.config = { ...this.config, ...JSON.parse(stored) };
        if (!this.config.appKey) {
          this.config.appKey = DEFAULT_APP_KEY;
        }
      }
      this.lastRemoteRev = localStorage.getItem(STORAGE_KEY_REMOTE_REV);
    } catch (e) {
      console.error('Failed to load Dropbox config from storage:', e);
    }
  }

  private restoreAuthSession(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_AUTH);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.accessToken = parsed.accessToken || null;
        this.refreshToken = parsed.refreshToken || null;
        this.tokenExpiresAt = parsed.tokenExpiresAt || null;
        this.currentUser = parsed.user || null;
        this.lastSyncedTime = parsed.lastSynced ? new Date(parsed.lastSynced) : null;

        if (this.accessToken) {
          this.syncStatus = 'synced';
          this.startBackgroundMonitor();
        }
      }
    } catch (e) {
      console.error('Failed to restore Dropbox auth session:', e);
    }
  }

  private saveAuthSession(): void {
    try {
      if (this.accessToken) {
        localStorage.setItem(
          STORAGE_KEY_AUTH,
          JSON.stringify({
            accessToken: this.accessToken,
            refreshToken: this.refreshToken,
            tokenExpiresAt: this.tokenExpiresAt,
            user: this.currentUser,
            lastSynced: this.lastSyncedTime?.toISOString() || null,
          })
        );
      } else {
        localStorage.removeItem(STORAGE_KEY_AUTH);
      }

      if (this.lastRemoteRev) {
        localStorage.setItem(STORAGE_KEY_REMOTE_REV, this.lastRemoteRev);
      }
    } catch (e) {
      console.error('Failed to save Dropbox auth session:', e);
    }
  }

  /**
   * Listen to database changes and auto-push to Dropbox
   */
  private listenToDatabaseChanges(): void {
    dbService.addChangeListener(() => {
      if (!this.isAuthenticated() || !this.config.autoSync) return;

      if (this.autoPushTimer) clearTimeout(this.autoPushTimer);
      this.autoPushTimer = setTimeout(async () => {
        try {
          this.logSync('info', 'Auto-sync Triggered', 'Pushing local changes to Dropbox...');
          await this.syncWithDropbox();
        } catch (e: any) {
          console.error('Auto-push to Dropbox failed:', e);
          this.logSync('error', 'Auto-sync Failed', e.message);
        }
      }, 4000);
    });
  }

  private startBackgroundMonitor(): void {
    if (this.pollIntervalTimer) clearInterval(this.pollIntervalTimer);
    const intervalMs = Math.max(30, this.config.syncIntervalSeconds) * 1000;
    this.pollIntervalTimer = setInterval(() => {
      if (this.isAuthenticated() && !dbService.isDirty()) {
        this.checkRemoteAndReconcile('background_poll').catch((e) => {
          console.warn('Dropbox background check notice:', e.message);
        });
      }
    }, intervalMs);
  }

  // Helper: Generates random PKCE code verifier and challenge
  public async generatePKCE(): Promise<{ verifier: string; challenge: string }> {
    const array = new Uint8Array(64);
    window.crypto.getRandomValues(array);
    const verifier = Array.from(array, (dec) => ('0' + dec.toString(16)).substr(-2)).join('');

    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);

    const hashArray = new Uint8Array(hashBuffer);
    let binary = '';
    for (let i = 0; i < hashArray.byteLength; i++) {
      binary += String.fromCharCode(hashArray[i]);
    }
    const challenge = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return { verifier, challenge };
  }

  /**
   * Initiates standard Dropbox OAuth 2.0 PKCE Authorization flow
   */
  public async initiateOAuthLogin(): Promise<void> {
    const { verifier, challenge } = await this.generatePKCE();
    sessionStorage.setItem(STORAGE_KEY_PKCE_VERIFIER, verifier);

    const redirectUri = window.location.origin + window.location.pathname;
    const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${encodeURIComponent(
      this.config.appKey
    )}&response_type=code&code_challenge=${encodeURIComponent(
      challenge
    )}&code_challenge_method=S256&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&token_access_type=offline`;

    window.location.href = authUrl;
  }

  /**
   * Initiates Token (Implicit) Authorization flow as an alternative
   */
  public initiateImplicitOAuthLogin(): void {
    const redirectUri = window.location.origin + window.location.pathname;
    const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${encodeURIComponent(
      this.config.appKey
    )}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}`;

    window.location.href = authUrl;
  }

  /**
   * Handles OAuth Redirect Callback on page load
   */
  public async handleOAuthCallback(): Promise<boolean> {
    // 1. Check for PKCE Code flow (?code=...)
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      const verifier = sessionStorage.getItem(STORAGE_KEY_PKCE_VERIFIER) || '';
      sessionStorage.removeItem(STORAGE_KEY_PKCE_VERIFIER);

      const redirectUri = window.location.origin + window.location.pathname;
      const cleanUrl = redirectUri + window.location.hash;
      window.history.replaceState({}, document.title, cleanUrl);

      this.setSyncStatus('syncing');
      try {
        const bodyParams = new URLSearchParams({
          code,
          grant_type: 'authorization_code',
          client_id: this.config.appKey,
          code_verifier: verifier,
          redirect_uri: redirectUri,
        });

        const tokenResp = await fetch('https://api.dropboxapi.com/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: bodyParams.toString(),
        });

        const data = await tokenResp.json();
        if (data.error) {
          throw new Error(data.error_description || data.error);
        }

        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token || null;
        if (data.expires_in) {
          this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
        }

        await this.fetchUserInfo();
        this.saveAuthSession();
        this.setSyncStatus('synced');
        this.logSync('info', 'Dropbox Connected', `Connected as ${this.currentUser?.name || 'User'}`);

        await this.checkRemoteAndReconcile('oauth_pkce_connected');
        this.startBackgroundMonitor();
        return true;
      } catch (err: any) {
        this.setSyncStatus('error');
        this.logSync('error', 'Dropbox PKCE Token Exchange Failed', err.message);
        throw err;
      }
    }

    // 2. Check for Implicit Flow token (#access_token=...)
    if (window.location.hash && window.location.hash.includes('access_token=')) {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const token = hashParams.get('access_token');
      if (token) {
        window.history.replaceState(
          {},
          document.title,
          window.location.origin + window.location.pathname + window.location.search
        );
        await this.connectWithToken(token);
        return true;
      }
    }

    return false;
  }

  /**
   * Connect with manual Dropbox access token
   */
  public async connectWithToken(token: string): Promise<void> {
    this.accessToken = token;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
    this.setSyncStatus('syncing');

    try {
      await this.fetchUserInfo();
      this.saveAuthSession();
      await this.checkRemoteAndReconcile('token_connected');
      this.startBackgroundMonitor();
    } catch (e: any) {
      this.logout();
      throw e;
    }
  }

  public logout(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
    this.currentUser = null;
    this.lastSyncedTime = null;
    this.lastRemoteRev = null;
    if (this.autoPushTimer) clearTimeout(this.autoPushTimer);
    if (this.pollIntervalTimer) clearInterval(this.pollIntervalTimer);
    localStorage.removeItem(STORAGE_KEY_AUTH);
    localStorage.removeItem(STORAGE_KEY_REMOTE_REV);
    this.setSyncStatus('offline');
  }

  public updateConfig(newConfig: Partial<DropboxAuthConfig>) {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(this.config));
    } catch (e) {
      console.error('Failed to save Dropbox config:', e);
    }
  }

  public getConfig(): DropboxAuthConfig {
    return { ...this.config };
  }

  /**
   * Ensure fresh access token before API calls
   */
  private async ensureValidToken(): Promise<string> {
    if (!this.accessToken) {
      throw new Error('Not authenticated with Dropbox');
    }

    // Check expiration if we have a refresh token
    if (this.refreshToken && this.tokenExpiresAt && Date.now() > this.tokenExpiresAt - 60000) {
      try {
        const bodyParams = new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: this.config.appKey,
        });

        const resp = await fetch('https://api.dropboxapi.com/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: bodyParams.toString(),
        });

        const data = await resp.json();
        if (data.access_token) {
          this.accessToken = data.access_token;
          if (data.expires_in) {
            this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
          }
          this.saveAuthSession();
        }
      } catch (refreshErr) {
        console.warn('Failed to refresh Dropbox access token:', refreshErr);
      }
    }

    if (!this.accessToken) {
      throw new Error('Not authenticated with Dropbox');
    }

    return this.accessToken;
  }

  /**
   * Fetch current user profile and quota usage
   */
  public async fetchUserInfo(): Promise<DropboxUser> {
    const token = await this.ensureValidToken();

    // 1. Account info
    const accountResp = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: 'null',
    });

    if (!accountResp.ok) {
      throw new Error(`Failed to fetch Dropbox account details: HTTP ${accountResp.status}`);
    }

    const accountData = await accountResp.json();

    // 2. Storage usage
    let spaceUsed = 0;
    let spaceTotal = 2 * 1024 * 1024 * 1024; // 2GB default fallback
    try {
      const spaceResp = await fetch('https://api.dropboxapi.com/2/users/get_space_usage', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: 'null',
      });
      if (spaceResp.ok) {
        const spaceData = await spaceResp.json();
        spaceUsed = spaceData.used || 0;
        if (spaceData.allocation && spaceData.allocation.allocated) {
          spaceTotal = spaceData.allocation.allocated;
        }
      }
    } catch (e) {
      console.warn('Could not fetch Dropbox space usage:', e);
    }

    this.currentUser = {
      accountId: accountData.account_id,
      name: accountData.name?.display_name || 'Dropbox User',
      email: accountData.email || '',
      profilePhotoUrl: accountData.profile_photo_url,
      country: accountData.country,
      spaceUsed,
      spaceTotal,
    };

    return this.currentUser;
  }

  /**
   * Download a file from Dropbox App folder
   */
  public async downloadFile(path: string): Promise<Uint8Array | null> {
    const token = await this.ensureValidToken();

    const normalizedPath = path.startsWith('/') ? path : '/' + path;

    const resp = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({ path: normalizedPath }),
      },
    });

    if (resp.status === 409) {
      // Path not found (file doesn't exist yet on remote Dropbox)
      return null;
    }

    if (!resp.ok) {
      throw new Error(`Dropbox download error: HTTP ${resp.status} ${resp.statusText}`);
    }

    const metaHeader = resp.headers.get('Dropbox-API-Result');
    if (metaHeader) {
      try {
        const meta = JSON.parse(metaHeader);
        if (meta.rev) {
          this.lastRemoteRev = meta.rev;
        }
      } catch (e) {
        // ignore
      }
    }

    const arrayBuf = await resp.arrayBuffer();
    return new Uint8Array(arrayBuf);
  }

  /**
   * Upload binary or text data to Dropbox App folder
   */
  public async uploadFile(path: string, data: Uint8Array | string): Promise<{ rev: string; size: number }> {
    const token = await this.ensureValidToken();
    const normalizedPath = path.startsWith('/') ? path : '/' + path;

    const body =
      typeof data === 'string'
        ? new Blob([data], { type: 'text/plain;charset=utf-8' })
        : new Blob([data.buffer as ArrayBuffer], { type: 'application/octet-stream' });

    const resp = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': JSON.stringify({
          path: normalizedPath,
          mode: 'overwrite',
          autorename: false,
          mute: true,
          strict_conflict: false,
        }),
        'Content-Type': 'application/octet-stream',
      },
      body,
    });

    const result = await resp.json();
    if (!resp.ok || result.error) {
      throw new Error(result.error_summary || 'Failed to upload file to Dropbox');
    }

    if (result.rev) {
      this.lastRemoteRev = result.rev;
    }

    return { rev: result.rev, size: result.size };
  }

  /**
   * Upload database to Dropbox based on selected format(s)
   */
  public async uploadDatabaseToDropbox(): Promise<void> {
    if (!this.accessToken) throw new Error('Not authenticated with Dropbox');

    const format = this.config.syncFormat;

    // 1. Sync SQLite binary if requested
    if (format === 'sqlite' || format === 'both') {
      const binaryData = await dbService.exportDatabase();
      const res = await this.uploadFile('/pem_database.sqlite', binaryData);
      this.lastRemoteRev = res.rev;
    }

    // 2. Sync SQL dump if requested
    if (format === 'sql' || format === 'both') {
      const sqlText = await dbService.exportSqlDump();
      await this.uploadFile('/pem_data.sql', sqlText);
    }

    this.lastSyncedTime = new Date();
    this.saveAuthSession();
  }

  /**
   * Checks Dropbox for remote updates and reconciles cleanly
   */
  public async checkRemoteAndReconcile(
    triggerReason: string
  ): Promise<{ action: 'downloaded' | 'uploaded' | 'both' | 'no_change' | 'merged' }> {
    if (!this.accessToken) return { action: 'no_change' };

    this.setSyncStatus('syncing');

    try {
      const format = this.config.syncFormat;
      let remoteBytes: Uint8Array | null = null;
      let isSql = false;

      // Try fetching sqlite binary or sql dump based on preference
      if (format === 'sqlite' || format === 'both') {
        remoteBytes = await this.downloadFile('/pem_database.sqlite');
      }

      if (!remoteBytes && (format === 'sql' || format === 'both')) {
        remoteBytes = await this.downloadFile('/pem_data.sql');
        isSql = true;
      }

      // If remote has neither file, upload local state
      if (!remoteBytes || remoteBytes.length === 0) {
        this.logSync('push', 'Initial Push', 'Created database on Dropbox');
        await this.uploadDatabaseToDropbox();
        this.setSyncStatus('synced');
        return { action: 'uploaded' };
      }

      // If local is currently marked dirty by user activity
      if (dbService.isDirty()) {
        if (!isSql) {
          const mergeStats = await dbService.mergeDatabaseBinary(remoteBytes);
          this.logSync(
            'merge',
            'Smart Merge Applied',
            `Reconciled: +${mergeStats.inserted} inserted, ~${mergeStats.updated} updated, ${mergeStats.conflictsResolved} conflicts resolved`
          );
        } else {
          // SQL script import
          const text = new TextDecoder().decode(remoteBytes);
          await dbService.importSqlDump(text);
          this.logSync('merge', 'SQL Script Reconciled', 'Applied remote SQL statements');
        }

        // Push unified state back to Dropbox
        await this.uploadDatabaseToDropbox();
        this.setSyncStatus('synced');
        return { action: 'merged' };
      }

      // Check whether remote file has changes
      const headerStr = String.fromCharCode(...remoteBytes.subarray(0, 15));
      if (headerStr.startsWith('SQLite format 3')) {
        await dbService.loadDatabaseBinary(remoteBytes);
        this.logSync('pull', 'Remote Database Applied', `Loaded ${(remoteBytes.byteLength / 1024).toFixed(1)} KB from Dropbox`);
      } else {
        const text = new TextDecoder().decode(remoteBytes);
        await dbService.importSqlDump(text);
        this.logSync('pull', 'Remote SQL Dump Applied', `Executed ${(remoteBytes.byteLength / 1024).toFixed(1)} KB SQL script`);
      }

      this.lastSyncedTime = new Date();
      this.setSyncStatus('synced');
      return { action: 'downloaded' };
    } catch (err: any) {
      this.setSyncStatus('error');
      this.logSync('error', `Sync failed (${triggerReason})`, err.message);
      throw err;
    }
  }

  /**
   * Manual Sync Trigger
   */
  public async syncWithDropbox(): Promise<{ action: 'downloaded' | 'uploaded' | 'both' | 'no_change' | 'merged' }> {
    return this.checkRemoteAndReconcile('manual_sync');
  }

  /**
   * Startup sync handler called on page load/refresh
   */
  public async initializeStartupSync(): Promise<void> {
    if (!this.accessToken) return;
    try {
      await this.checkRemoteAndReconcile('page_startup');
    } catch (err: any) {
      console.warn('Initial Dropbox reconciliation notice:', err.message);
    }
  }

  public isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  public getCurrentUser(): DropboxUser | null {
    return this.currentUser;
  }

  public getSyncStatus(): DropboxSyncStatus {
    return this.syncStatus;
  }

  public getLastSynced(): Date | null {
    return this.lastSyncedTime;
  }

  public getSyncLogs(): DropboxSyncLogEntry[] {
    return [...this.syncLogs];
  }

  public onStatusChange(callback: (status: DropboxSyncStatus) => void): () => void {
    this.statusListeners.add(callback);
    return () => this.statusListeners.delete(callback);
  }

  public onHistoryChange(callback: () => void): () => void {
    this.historyListeners.add(callback);
    return () => this.historyListeners.delete(callback);
  }

  private setSyncStatus(status: DropboxSyncStatus): void {
    this.syncStatus = status;
    this.statusListeners.forEach((l) => l(status));
  }

  private logSync(type: DropboxSyncLogEntry['type'], title: string, details?: string): void {
    const entry: DropboxSyncLogEntry = {
      id: 'dlog_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type,
      title,
      details,
    };
    this.syncLogs.unshift(entry);
    if (this.syncLogs.length > 50) this.syncLogs.pop();
    this.historyListeners.forEach((l) => l());
  }
}

export const dropboxService = DropboxService.getInstance();
