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

const STORAGE_KEY_AUTH = 'pem_pcloud_auth_session';
const STORAGE_KEY_CONFIG = 'pem_pcloud_config';
const DEFAULT_CLIENT_ID = 'cQmzJUo7RiJ';
const PRODUCTION_DOMAIN = 'https://pem.freshfood.rocks';

export class PCloudService {
  private static instance: PCloudService;
  private accessToken: string | null = null;
  private locationId: number = 1; // 1 = US, 2 = EU
  private currentUser: PCloudUser | null = null;
  private syncStatus: SyncStatus = 'offline';
  private statusListeners: Set<(status: SyncStatus) => void> = new Set();
  private lastSyncedTime: Date | null = null;

  private config: PCloudAuthConfig = {
    clientId: DEFAULT_CLIENT_ID,
    redirectUri: PRODUCTION_DOMAIN,
    region: 'us',
  };

  private constructor() {
    this.loadSavedConfig();
    this.loadSavedAuth();
    this.handleImplicitGrantCallback();

    // Listen to local DB changes to set status to 'pending' if connected
    dbService.addChangeListener(() => {
      if (this.accessToken && this.syncStatus === 'synced') {
        this.setSyncStatus('pending');
      }
    });
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
      } else {
        // Automatically default redirectUri to window.location.origin if running on preview/dev
        if (typeof window !== 'undefined' && window.location.hostname !== 'pem.freshfood.rocks') {
          this.config.redirectUri = window.location.origin;
        }
      }
    } catch (e) {
      console.error('Failed to load pCloud config:', e);
    }
  }

  public updateConfig(newConfig: Partial<PCloudAuthConfig>) {
    this.config = { ...this.config, ...newConfig };
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(this.config));
  }

  public getConfig(): PCloudAuthConfig {
    return { ...this.config };
  }

  private loadSavedAuth() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_AUTH);
      if (saved) {
        const parsed = JSON.parse(saved);
        this.accessToken = parsed.accessToken;
        this.locationId = parsed.locationId || 1;
        this.currentUser = parsed.user || null;
        if (this.accessToken) {
          this.setSyncStatus('synced');
          // Silently refresh userinfo in background
          this.fetchUserInfo().catch(console.error);
        }
      }
    } catch (e) {
      console.error('Failed to load pCloud auth:', e);
    }
  }

  /**
   * Securely parse implicit grant token from the URL hash fragment
   * #access_token=...&token_type=bearer&userid=...&locationid=...
   */
  private handleImplicitGrantCallback() {
    if (typeof window === 'undefined') return;

    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
      const params = new URLSearchParams(hash.replace(/^#/, ''));
      const token = params.get('access_token');
      const locationIdStr = params.get('locationid');
      const userIdStr = params.get('userid');

      if (token) {
        this.accessToken = token;
        this.locationId = locationIdStr ? parseInt(locationIdStr, 10) : 1;
        this.saveAuthSession();

        // Immediately scrub the access token from the URL hash for security
        window.history.replaceState(null, '', window.location.pathname + window.location.search);

        this.setSyncStatus('syncing');
        this.fetchUserInfo()
          .then(() => {
            // Attempt initial sync on successful login
            this.syncWithPCloud();
          })
          .catch((err) => {
            console.error('Error post-oauth login:', err);
            this.setSyncStatus('error');
          });
      }
    }
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

    const authUrl = `${authHost}/oauth/authorize?client_id=${encodeURIComponent(
      this.config.clientId
    )}&response_type=token&redirect_uri=${encodeURIComponent(redirect)}`;

    window.location.href = authUrl;
  }

  /**
   * Direct manual token connection (e.g. for custom tokens or direct API keys)
   */
  public async connectWithToken(token: string, locationId: number = 1): Promise<boolean> {
    this.accessToken = token.trim();
    this.locationId = locationId;
    this.setSyncStatus('syncing');

    try {
      await this.fetchUserInfo();
      this.saveAuthSession();
      await this.syncWithPCloud();
      return true;
    } catch (e) {
      this.accessToken = null;
      this.currentUser = null;
      this.setSyncStatus('error');
      throw e;
    }
  }

  public logout(): void {
    this.accessToken = null;
    this.currentUser = null;
    localStorage.removeItem(STORAGE_KEY_AUTH);
    this.setSyncStatus('offline');
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
        // Token expired or invalid
        this.logout();
        throw new Error('pCloud access token expired or invalid. Please sign in again.');
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
   * Full bidirectional synchronization:
   * 1. Checks if remote `/PEMTracker/pem_database.sqlite` exists
   * 2. If it exists and local DB was not modified recently, pulls remote DB
   * 3. Pushes local DB to remote
   */
  public async syncWithPCloud(): Promise<{ action: 'downloaded' | 'uploaded' | 'both' }> {
    if (!this.accessToken) {
      this.setSyncStatus('offline');
      throw new Error('No active pCloud connection');
    }

    this.setSyncStatus('syncing');

    try {
      // 1. Ensure folder exists
      await fetch(
        `${this.getApiHost()}/createfolderifnotexists?path=/PEMTracker&access_token=${this.accessToken}`
      );

      // 2. Check if remote file exists
      const linkRes = await fetch(
        `${this.getApiHost()}/getfilelink?path=/PEMTracker/pem_database.sqlite&access_token=${this.accessToken}`
      );
      const linkData = await linkRes.json();

      let action: 'downloaded' | 'uploaded' | 'both' = 'uploaded';

      if (linkData.result === 0 && linkData.hosts && linkData.hosts.length > 0) {
        // Remote file exists!
        // We can either pull if local has no records, or upload current
        const localPEMs = await dbService.getAllPEMs();
        const localActs = await dbService.getAllActivities();

        if (localPEMs.length <= 5 && localActs.length <= 5) {
          // Pull remote
          const remoteUrl = `https://${linkData.hosts[0]}${linkData.path}`;
          const fileResp = await fetch(remoteUrl);
          const arrayBuffer = await fileResp.arrayBuffer();
          await dbService.loadDatabaseBinary(new Uint8Array(arrayBuffer));
          action = 'downloaded';
        } else {
          // Upload local
          await this.uploadDatabaseToPCloud();
          action = 'uploaded';
        }
      } else {
        // Remote doesn't exist yet, upload current local database
        await this.uploadDatabaseToPCloud();
        action = 'uploaded';
      }

      this.lastSyncedTime = new Date();
      this.setSyncStatus('synced');
      return { action };
    } catch (err) {
      console.error('Sync failed:', err);
      this.setSyncStatus('error');
      throw err;
    }
  }

  /**
   * Upload SQLite binary directly to pCloud /PEMTracker/pem_database.sqlite
   */
  public async uploadDatabaseToPCloud(): Promise<void> {
    if (!this.accessToken) throw new Error('Not authenticated');

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

    this.lastSyncedTime = new Date();
    this.setSyncStatus('synced');
  }

  /**
   * Download SQLite binary from pCloud and overwrite local database
   */
  public async downloadDatabaseFromPCloud(): Promise<void> {
    if (!this.accessToken) throw new Error('Not authenticated');

    this.setSyncStatus('syncing');

    const linkRes = await fetch(
      `${this.getApiHost()}/getfilelink?path=/PEMTracker/pem_database.sqlite&access_token=${this.accessToken}`
    );
    const linkData = await linkRes.json();

    if (linkData.result !== 0) {
      this.setSyncStatus('error');
      throw new Error(linkData.error || 'Database file not found on pCloud drive');
    }

    const downloadUrl = `https://${linkData.hosts[0]}${linkData.path}`;
    const fileResp = await fetch(downloadUrl);
    const arrayBuffer = await fileResp.arrayBuffer();

    await dbService.loadDatabaseBinary(new Uint8Array(arrayBuffer));
    this.lastSyncedTime = new Date();
    this.setSyncStatus('synced');
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
}

export const pcloudService = PCloudService.getInstance();
