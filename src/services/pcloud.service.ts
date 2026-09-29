/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SyncStatus } from '../types/database.types';
import { dbService } from './database.service';

export interface PCloudUser {
  userid: number;
  email: string;
  quota: number;
  usedquota: number;
  registered: string;
}

export interface PCloudAuthConfig {
  clientId: string;
  redirectUri: string;
  region: 'us' | 'eu';
}

export interface SyncLogEntry {
  id: string;
  timestamp: Date;
  type: 'push' | 'pull' | 'merge' | 'check' | 'error';
  summary: string;
  details?: string;
}

const STORAGE_KEY_AUTH = 'pem_pcloud_auth_session';
const STORAGE_KEY_CONFIG = 'pem_pcloud_config';
const STORAGE_KEY_REMOTE_HASH = 'pem_pcloud_remote_hash';
const DEFAULT_CLIENT_ID = 'cQmzJUo7RiJ';
const PRODUCTION_DOMAIN = 'https://pem.freshfood.rocks';

export class PCloudService {
  private static instance: PCloudService;
  private accessToken: string | null = null;
  private locationId: number = 1; // 1 = US, 2 = EU
  private currentUser: PCloudUser | null = null;
  private syncStatus: SyncStatus = 'offline';
  private statusListeners: Set<(status: SyncStatus) => void> = new Set();
  private historyListeners: Set<() => void> = new Set();
  private lastSyncedTime: Date | null = null;
  private lastRemoteHash: number | null = null;
  private lastRemoteModified: string | null = null;
  private autoPushTimer: any = null;
  private pollIntervalTimer: any = null;
  private isSyncingOperation = false;
  private syncLogs: SyncLogEntry[] = [];

  private config: PCloudAuthConfig = {
    clientId: DEFAULT_CLIENT_ID,
    redirectUri: PRODUCTION_DOMAIN,
    region: 'us',
  };

  private constructor() {
    this.loadSavedConfig();
    this.loadSavedAuth();
    this.handleImplicitGrantCallback();

    // 1. Reactive Auto-Push: Listen for any local database modifications
    dbService.addChangeListener(() => {
      if (!this.accessToken) return;
      if (this.isSyncingOperation) return;

      this.setSyncStatus('pending');
      this.scheduleAutoPush();
    });

    // 2. Active Cloud Monitoring: Check for remote updates on window focus & tab visibility
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', () => {
        this.checkRemoteAndReconcile('window_focus');
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.checkRemoteAndReconcile('tab_visible');
        }
      });
    }

    // 3. Start recurring background polling if authenticated
    if (this.accessToken) {
      this.startBackgroundMonitor();
    }
  }

  public static getInstance(): PCloudService {
    if (!PCloudService.instance) {
      PCloudService.instance = new PCloudService();
    }
    return PCloudService.instance;
  }

  private loadSavedConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load saved pCloud config:', e);
    }
  }

  private loadSavedAuth() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_AUTH);
      const savedHash = localStorage.getItem(STORAGE_KEY_REMOTE_HASH);
      if (savedHash) {
        this.lastRemoteHash = Number(savedHash) || null;
      }
      if (saved) {
        const parsed = JSON.parse(saved);
        this.accessToken = parsed.accessToken;
        this.locationId = parsed.locationId || 1;
        this.currentUser = parsed.user || null;
        if (this.accessToken) {
          this.setSyncStatus('synced');
        }
      }
    } catch (e) {
      console.warn('Failed to load saved pCloud auth:', e);
    }
  }

  /**
   * Parses implicit grant URL fragment e.g. #access_token=...&locationid=...
   */
  public handleImplicitGrantCallback(): boolean {
    if (typeof window === 'undefined') return false;

    const hash = window.location.hash.substring(1);
    if (!hash) return false;

    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    const locationIdStr = params.get('locationid');

    if (token) {
      this.accessToken = token;
      this.locationId = locationIdStr ? parseInt(locationIdStr, 10) : 1;
      this.setSyncStatus('synced');
      this.saveAuthSession();

      // Clean token immediately from URL bar for security
      const cleanUrl = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', cleanUrl);

      // Initial userinfo and sync
      this.fetchUserInfo().catch(console.error);
      this.checkRemoteAndReconcile('initial_login').catch(console.error);
      this.startBackgroundMonitor();
      return true;
    }

    return false;
  }

  private saveAuthSession() {
    try {
      localStorage.setItem(
        STORAGE_KEY_AUTH,
        JSON.stringify({
          accessToken: this.accessToken,
          locationId: this.locationId,
          user: this.currentUser,
        })
      );
      if (this.lastRemoteHash) {
        localStorage.setItem(STORAGE_KEY_REMOTE_HASH, String(this.lastRemoteHash));
      }
    } catch (e) {
      console.error('Failed to save pCloud auth session:', e);
    }
  }

  /**
   * Initiates pCloud OAuth 2.0 Implicit Grant
   */
  public initiateImplicitOAuthLogin(regionOverride?: 'us' | 'eu'): void {
    const region = regionOverride || this.config.region;
    const authHost = region === 'eu' ? 'https://eumy.pcloud.com' : 'https://my.pcloud.com';
    const redirect = this.config.redirectUri;

    const authUrl = `${authHost}/oauth2/authorize?client_id=${encodeURIComponent(
      this.config.clientId
    )}&response_type=token&redirect_uri=${encodeURIComponent(redirect)}`;

    window.location.href = authUrl;
  }

  /**
   * Manual token connection
   */
  public async connectWithToken(token: string, locationId: number = 1): Promise<void> {
    this.accessToken = token;
    this.locationId = locationId;
    this.setSyncStatus('syncing');

    try {
      await this.fetchUserInfo();
      this.saveAuthSession();
      await this.checkRemoteAndReconcile('token_connected');
      this.startBackgroundMonitor();
    } catch (e) {
      this.logout();
      throw e;
    }
  }

  public logout(): void {
    this.accessToken = null;
    this.currentUser = null;
    this.lastSyncedTime = null;
    this.lastRemoteHash = null;
    this.lastRemoteModified = null;
    if (this.autoPushTimer) clearTimeout(this.autoPushTimer);
    if (this.pollIntervalTimer) clearInterval(this.pollIntervalTimer);
    localStorage.removeItem(STORAGE_KEY_AUTH);
    localStorage.removeItem(STORAGE_KEY_REMOTE_HASH);
    this.setSyncStatus('offline');
  }

  public updateConfig(newConfig: Partial<PCloudAuthConfig>) {
    this.config = { ...this.config, ...newConfig };
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(this.config));
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  }

  public getConfig(): PCloudAuthConfig {
    return { ...this.config };
  }

  public getApiHost(): string {
    return this.locationId === 2 ? 'https://eapi.pcloud.com' : 'https://api.pcloud.com';
  }

  public async fetchUserInfo(): Promise<PCloudUser> {
    if (!this.accessToken) throw new Error('Not authenticated with pCloud');

    const response = await fetch(`${this.getApiHost()}/userinfo?access_token=${this.accessToken}`);
    const data = await response.json();

    if (data.result !== 0) {
      if (data.result === 1000 || data.result === 2000) {
        this.logout();
        throw new Error('pCloud access token expired. Please sign in again.');
      }
      throw new Error(data.error || 'Failed to fetch user info');
    }

    this.currentUser = {
      userid: data.userid,
      email: data.email,
      quota: data.quota,
      usedquota: data.usedquota,
      registered: data.registered,
    };
    this.saveAuthSession();
    return this.currentUser;
  }

  /**
   * Schedules a debounced auto-push to pCloud after local updates
   */
  private scheduleAutoPush() {
    if (this.autoPushTimer) {
      clearTimeout(this.autoPushTimer);
    }

    // Debounce by 1.8 seconds to batch multi-row or rapid inputs
    this.autoPushTimer = setTimeout(() => {
      this.checkRemoteAndReconcile('auto_push_trigger').catch((err) => {
        console.error('Auto-push synchronization error:', err);
      });
    }, 1800);
  }

  /**
   * Starts recurring remote monitoring every 20 seconds
   */
  private startBackgroundMonitor() {
    if (this.pollIntervalTimer) clearInterval(this.pollIntervalTimer);

    this.pollIntervalTimer = setInterval(() => {
      if (this.accessToken && !this.isSyncingOperation) {
        this.checkRemoteAndReconcile('poll_interval').catch((err) => {
          console.warn('Background remote poll notice:', err);
        });
      }
    }, 20000);
  }

  /**
   * Core Sophisticated Multi-Device Sync Engine:
   * - Checks remote file stat (hash and modified date)
   * - Avoids collisions:
   *   a. If remote hasn't changed and local is dirty -> auto-upload local database
   *   b. If remote has changed and local is clean -> fast pull remote database
   *   c. If remote has changed AND local is dirty (collision) -> perform smart two-way merge & re-upload
   */
  public async checkRemoteAndReconcile(trigger: string): Promise<{
    action: 'no_change' | 'uploaded' | 'downloaded' | 'merged';
    details?: string;
  }> {
    if (!this.accessToken) {
      this.setSyncStatus('offline');
      return { action: 'no_change' };
    }

    if (this.isSyncingOperation) {
      return { action: 'no_change' };
    }

    this.isSyncingOperation = true;

    try {
      // 1. Ensure remote folder exists
      await fetch(
        `${this.getApiHost()}/createfolderifnotexists?path=/PEMTracker&access_token=${this.accessToken}`
      );

      // 2. Fetch remote file metadata via 'stat'
      const statRes = await fetch(
        `${this.getApiHost()}/stat?path=/PEMTracker/pem_database.sqlite&access_token=${this.accessToken}`
      );
      const statData = await statRes.json();

      const remoteExists = statData.result === 0 && statData.metadata && !statData.metadata.isfolder;
      const remoteHash: number | null = remoteExists ? Number(statData.metadata.hash) : null;
      const remoteModified: string | null = remoteExists ? String(statData.metadata.modified) : null;

      const isLocalDirty = dbService.isDirty();

      // Case 1: Remote file does not exist yet on pCloud -> Upload initial local database
      if (!remoteExists) {
        this.setSyncStatus('syncing');
        await this.uploadDatabaseToPCloud();
        this.logSync('push', 'Initial cloud push', 'Uploaded initial SQLite database to /PEMTracker/pem_database.sqlite');
        this.setSyncStatus('synced');
        return { action: 'uploaded', details: 'Created initial remote database' };
      }

      // Case 2: Remote file exists. Did remote file change since our last known hash?
      const remoteChanged = this.lastRemoteHash === null || this.lastRemoteHash !== remoteHash;

      // Subcase 2A: Neither remote nor local changed -> Perfect sync
      if (!remoteChanged && !isLocalDirty) {
        this.setSyncStatus('synced');
        return { action: 'no_change' };
      }

      // Subcase 2B: Remote did NOT change, but local HAS changed -> Auto-push local changes to cloud
      if (!remoteChanged && isLocalDirty) {
        this.setSyncStatus('syncing');
        await this.uploadDatabaseToPCloud();
        dbService.markClean();
        this.logSync('push', 'Auto-pushed local updates', 'Uploaded modified SQLite database to pCloud');
        this.setSyncStatus('synced');
        return { action: 'uploaded', details: 'Pushed local changes' };
      }

      // Subcase 2C: Remote HAS changed, but local is CLEAN (e.g. user just updated on phone and opened desktop)
      if (remoteChanged && !isLocalDirty) {
        this.setSyncStatus('syncing');
        const remoteBytes = await this.fetchRemoteBinary();
        await dbService.loadDatabaseBinary(remoteBytes);
        this.lastRemoteHash = remoteHash;
        this.lastRemoteModified = remoteModified;
        this.saveAuthSession();
        this.lastSyncedTime = new Date();
        this.logSync('pull', 'Pulled remote changes', `Loaded updates made on another device (${remoteModified})`);
        this.setSyncStatus('synced');
        return { action: 'downloaded', details: 'Pulled cloud updates' };
      }

      // Subcase 2D: COLLISION SCENARIO! Remote HAS changed AND local IS DIRTY!
      // (User made changes on phone AND desktop while offline or concurrently)
      this.setSyncStatus('merging');
      this.logSync('check', 'Collision detected', 'Both local device and cloud contain unmerged changes. Starting smart two-way merge...');

      const remoteBytes = await this.fetchRemoteBinary();
      const mergeStats = await dbService.mergeDatabaseBinary(remoteBytes);

      // After merging, push the unified database back to pCloud so all devices share the resolved state
      await this.uploadDatabaseToPCloud();
      dbService.markClean();

      const detailMsg = `Merged ${mergeStats.inserted} new rows, updated ${mergeStats.updated} conflicting rows, resolved ${mergeStats.conflictsResolved} timestamps, and applied ${mergeStats.tombstonesApplied} remote deletions.`;
      this.logSync('merge', 'Smart merge & sync completed', detailMsg);

      this.lastSyncedTime = new Date();
      this.setSyncStatus('synced');
      return { action: 'merged', details: detailMsg };
    } catch (err: any) {
      console.error('Reconciliation error:', err);
      this.setSyncStatus('error');
      this.logSync('error', 'Sync failed', err.message || 'Error communicating with pCloud');
      throw err;
    } finally {
      this.isSyncingOperation = false;
    }
  }

  /**
   * Helper to download the remote binary file
   */
  private async fetchRemoteBinary(): Promise<Uint8Array> {
    const linkRes = await fetch(
      `${this.getApiHost()}/getfilelink?path=/PEMTracker/pem_database.sqlite&access_token=${this.accessToken}`
    );
    const linkData = await linkRes.json();

    if (linkData.result !== 0 || !linkData.hosts || linkData.hosts.length === 0) {
      throw new Error(linkData.error || 'Failed to generate download link for remote database');
    }

    const downloadUrl = `https://${linkData.hosts[0]}${linkData.path}`;
    const fileResp = await fetch(downloadUrl);
    if (!fileResp.ok) {
      throw new Error(`Failed to download remote database: HTTP ${fileResp.status}`);
    }

    const arrayBuffer = await fileResp.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  /**
   * Upload SQLite binary directly to pCloud /PEMTracker/pem_database.sqlite
   */
  public async uploadDatabaseToPCloud(): Promise<void> {
    if (!this.accessToken) throw new Error('Not authenticated with pCloud');

    const binaryData = await dbService.exportDatabase();
    const blob = new Blob([binaryData.buffer as ArrayBuffer], { type: 'application/x-sqlite3' });

    const formData = new FormData();
    formData.append('file', blob, 'pem_database.sqlite');

    const url = `${this.getApiHost()}/uploadfile?path=/PEMTracker&filename=pem_database.sqlite&access_token=${this.accessToken}&nopartial=1`;
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    if (result.result !== 0) {
      throw new Error(result.error || 'Failed to upload database to pCloud');
    }

    // Capture returned remote hash & modified timestamp
    if (result.metadata && result.metadata.length > 0) {
      this.lastRemoteHash = Number(result.metadata[0].hash);
      this.lastRemoteModified = String(result.metadata[0].modified);
    }

    this.lastSyncedTime = new Date();
    this.saveAuthSession();
  }

  /**
   * Manual Sync Trigger (wrapper around checkRemoteAndReconcile)
   */
  public async syncWithPCloud(): Promise<{ action: 'downloaded' | 'uploaded' | 'both' | 'no_change' | 'merged' }> {
    const outcome = await this.checkRemoteAndReconcile('manual_sync');
    if (outcome.action === 'uploaded') return { action: 'uploaded' };
    if (outcome.action === 'downloaded') return { action: 'downloaded' };
    if (outcome.action === 'merged') return { action: 'merged' };
    return { action: 'no_change' };
  }

  /**
   * Force download and overwrite local database from pCloud
   */
  public async downloadDatabaseFromPCloud(): Promise<void> {
    if (!this.accessToken) throw new Error('Not authenticated');

    this.setSyncStatus('syncing');
    try {
      const bytes = await this.fetchRemoteBinary();
      await dbService.loadDatabaseBinary(bytes);
      this.lastSyncedTime = new Date();
      this.setSyncStatus('synced');
      this.logSync('pull', 'Manual remote restore', 'Overwrote local database with cloud copy');
    } catch (e: any) {
      this.setSyncStatus('error');
      this.logSync('error', 'Manual restore failed', e.message);
      throw e;
    }
  }

  private logSync(type: SyncLogEntry['type'], summary: string, details?: string) {
    const entry: SyncLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date(),
      type,
      summary,
      details,
    };
    this.syncLogs.unshift(entry);
    if (this.syncLogs.length > 50) {
      this.syncLogs.pop();
    }
    this.notifyHistory();
  }

  public getSyncLogs(): SyncLogEntry[] {
    return [...this.syncLogs];
  }

  public getSyncStatus(): SyncStatus {
    return this.syncStatus;
  }

  public getLastSynced(): Date | null {
    return this.lastSyncedTime;
  }

  public getCurrentUser(): PCloudUser | null {
    return this.currentUser;
  }

  public isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  public onStatusChange(callback: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.syncStatus);
    return () => {
      this.statusListeners.delete(callback);
    };
  }

  public onHistoryChange(callback: () => void): () => void {
    this.historyListeners.add(callback);
    return () => {
      this.historyListeners.delete(callback);
    };
  }

  private setSyncStatus(status: SyncStatus) {
    this.syncStatus = status;
    this.statusListeners.forEach((listener) => {
      try {
        listener(status);
      } catch (e) {
        console.error('Error in status listener:', e);
      }
    });
  }

  private notifyHistory() {
    this.historyListeners.forEach((listener) => {
      try {
        listener();
      } catch (e) {
        console.error('Error in history listener:', e);
      }
    });
  }
}

export const pcloudService = PCloudService.getInstance();
