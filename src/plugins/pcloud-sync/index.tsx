/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Plugin, PluginContext } from '../plugin.types';
import { SyncStatus } from '../../types/database.types';
import { PCloudUser } from '../../services/pcloud.service';
import {
  Cloud,
  CloudCheck,
  CloudUpload,
  CloudDownload,
  Shield,
  Key,
  Globe,
  HardDrive,
  RefreshCw,
  LogOut,
  ExternalLink,
  CheckCircle2,
  FileCode,
  Download,
  Upload,
} from 'lucide-react';

const PCloudSyncView: React.FC<{ context: PluginContext }> = ({ context }) => {
  const [config, setConfig] = useState(context.pcloud.getConfig());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(context.pcloud.getSyncStatus());
  const [user, setUser] = useState<PCloudUser | null>(context.pcloud.getCurrentUser());
  const [lastSynced, setLastSynced] = useState<Date | null>(context.pcloud.getLastSynced());
  const [manualToken, setManualToken] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [dbSizeBytes, setDbSizeBytes] = useState<number>(0);

  const refreshDbSize = async () => {
    try {
      const bin = await context.database.exportDatabase();
      setDbSizeBytes(bin.byteLength);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshDbSize();
    const unsub = context.pcloud.onStatusChange((status) => {
      setSyncStatus(status);
      setUser(context.pcloud.getCurrentUser());
      setLastSynced(context.pcloud.getLastSynced());
    });
    return unsub;
  }, [context]);

  const handleUpdateConfig = (updates: Partial<typeof config>) => {
    const updated = { ...config, ...updates };
    setConfig(updated);
    context.pcloud.updateConfig(updated);
    context.showNotification('Configuration Updated', 'pCloud OAuth parameters updated', 'info');
  };

  const handleOAuthLogin = (region: 'us' | 'eu') => {
    context.showNotification('Redirecting to pCloud', 'Opening secure OAuth implicit authorization...', 'info');
    context.pcloud.initiateImplicitOAuthLogin(region);
  };

  const handleManualTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;

    try {
      setIsSyncing(true);
      await context.pcloud.connectWithToken(manualToken.trim(), config.region === 'eu' ? 2 : 1);
      context.showNotification('pCloud Connected', 'Authentication successful! Local database synchronized.', 'success');
      setManualToken('');
      refreshDbSize();
    } catch (err: any) {
      context.showNotification('Authentication Error', err.message || 'Failed to authenticate token', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    try {
      const res = await context.pcloud.syncWithPCloud();
      context.showNotification(
        'Database Synchronized',
        `Successfully ${res.action === 'downloaded' ? 'downloaded latest database from' : 'uploaded local database to'} pCloud drive!`,
        'success'
      );
      refreshDbSize();
    } catch (err: any) {
      context.showNotification('Sync Failed', err.message || 'Could not synchronize with pCloud', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDownloadFromCloud = async () => {
    if (!confirm('This will replace your current local SQLite database with the version on pCloud. Proceed?')) {
      return;
    }
    setIsSyncing(true);
    try {
      await context.pcloud.downloadDatabaseFromPCloud();
      context.showNotification('Database Downloaded', 'Local SQLite instance updated from pCloud drive', 'success');
      refreshDbSize();
    } catch (err: any) {
      context.showNotification('Download Failed', err.message || 'Failed to download from pCloud', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportSqliteFile = async () => {
    try {
      const bin = await context.database.exportDatabase();
      const blob = new Blob([bin.buffer as ArrayBuffer], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pem_database_${new Date().toISOString().slice(0, 10)}.sqlite`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      context.showNotification('Export Complete', 'SQLite binary database downloaded to your device', 'success');
    } catch (err: any) {
      context.showNotification('Export Failed', err.message, 'error');
    }
  };

  const handleImportSqliteFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const arrayBuf = reader.result as ArrayBuffer;
        await context.database.loadDatabaseBinary(new Uint8Array(arrayBuf));
        context.showNotification('Database Restored', `Loaded ${file.name} successfully into SQLite engine`, 'success');
        refreshDbSize();
      } catch (err: any) {
        context.showNotification('Import Failed', err.message || 'Invalid SQLite file', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleLogout = () => {
    if (confirm('Disconnect from pCloud? Your local cached database will remain intact.')) {
      context.pcloud.logout();
      context.showNotification('Disconnected', 'Logged out of pCloud session', 'info');
    }
  };

  const isAuthenticated = context.pcloud.isAuthenticated();

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <Cloud className="w-5 h-5 text-teal-400" />
              <span>pCloud Drive &amp; Implicit Grant Storage</span>
            </h2>
            <span
              className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                isAuthenticated
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
            >
              {isAuthenticated ? 'Connected to pCloud' : 'Local Offline Mode'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Client-side SQLite3 synchronization with personal pCloud cloud drive. Implicit OAuth grant ensures zero secret keys are exposed.
          </p>
        </div>

        {isAuthenticated && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync with pCloud'}</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800 text-xs transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          </div>
        )}
      </div>

      {/* Account Info Banner if authenticated */}
      {isAuthenticated && user && (
        <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold">
                {user.email.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{user.email}</p>
                <p className="text-xs text-slate-400 font-mono">
                  pCloud User ID: {user.userid} · Remote path:{' '}
                  <span className="text-teal-300">/PEMTracker/pem_database.sqlite</span>
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right text-xs text-slate-400">
              <p>
                Quota:{' '}
                <strong className="text-slate-200 font-mono">
                  {(user.usedquota / (1024 * 1024)).toFixed(1)} MB
                </strong>{' '}
                /{' '}
                <strong className="text-slate-200 font-mono">
                  {(user.quota / (1024 * 1024 * 1024)).toFixed(1)} GB
                </strong>
              </p>
              <p className="text-[11px] text-teal-400">
                {lastSynced ? `Last Synced: ${lastSynced.toLocaleTimeString()}` : 'Sync pending'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* OAuth Implicit Grant Configuration */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-teal-400" />
            <h3 className="text-base font-semibold text-white">OAuth 2.0 Implicit Grant Workflow</h3>
          </div>
          <span className="text-xs font-mono text-slate-400">Direct Client-Side Token Flow</span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          In OAuth 2.0 Implicit Grant, your browser redirects directly to pCloud to authorize access.
          pCloud returns the access token inside the URI fragment (<code>#access_token=...</code>).
          The application securely scrubs the token from the address bar immediately upon return, ensuring complete privacy with zero server secrets.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium">pCloud Client ID (App ID)</label>
            <input
              type="text"
              value={config.clientId}
              onChange={(e) => handleUpdateConfig({ clientId: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sky-300 font-mono focus:outline-none focus:border-teal-500"
            />
            <p className="text-[11px] text-slate-500">Provided API Client ID: cQmzJUo7RiJ</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-400 font-medium">Redirect URI</label>
            <input
              type="text"
              value={config.redirectUri}
              onChange={(e) => handleUpdateConfig({ redirectUri: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-teal-300 font-mono focus:outline-none focus:border-teal-500"
            />
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => handleUpdateConfig({ redirectUri: 'https://pem.freshfood.rocks' })}
                className="text-[11px] text-teal-400 hover:underline"
              >
                Set Production (pem.freshfood.rocks)
              </button>
              <span className="text-slate-600">·</span>
              <button
                type="button"
                onClick={() => handleUpdateConfig({ redirectUri: window.location.origin })}
                className="text-[11px] text-slate-400 hover:text-slate-200 hover:underline"
              >
                Set Current Host ({window.location.host})
              </button>
            </div>
          </div>
        </div>

        {/* Region & Implicit Auth Action */}
        {!isAuthenticated && (
          <div className="pt-2 border-t border-slate-800/80 space-y-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
              Authenticate via pCloud Account
            </span>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleOAuthLogin('us')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition-colors shadow-sm"
              >
                <Cloud className="w-4 h-4" />
                <span>Sign In with pCloud (Global / US Region)</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => handleOAuthLogin('eu')}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs transition-colors border border-slate-700"
              >
                <Globe className="w-4 h-4 text-sky-400" />
                <span>Sign In with pCloud (European Region)</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Manual Token Fallback */}
        {!isAuthenticated && (
          <div className="pt-3 border-t border-slate-800/60 space-y-2">
            <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-400" />
              <span>Or Direct Access Token Connection</span>
            </span>

            <form onSubmit={handleManualTokenSubmit} className="flex gap-2">
              <input
                type="password"
                placeholder="Paste pCloud Bearer token directly here..."
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white font-mono focus:outline-none focus:border-teal-500"
              />
              <button
                type="submit"
                disabled={!manualToken.trim() || isSyncing}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 disabled:opacity-50"
              >
                Connect Token
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Local SQLite Database File Management */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-teal-400" />
            <h3 className="text-base font-semibold text-white">Local SQLite3 Database &amp; Cache</h3>
          </div>
          <span className="font-mono text-xs text-teal-400 tabular-nums">
            {(dbSizeBytes / 1024).toFixed(1)} KB (in-memory WASM)
          </span>
        </div>

        <p className="text-xs text-slate-300">
          The SQLite3 database is cached locally in browser IndexedDB for high performance and offline capability.
          You can download the raw binary <code>.sqlite</code> file to inspect in SQLite Browser or upload a backup.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={handleExportSqliteFile}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 font-medium text-xs transition-colors border border-slate-800"
          >
            <Download className="w-3.5 h-3.5 text-teal-400" />
            <span>Download .sqlite File</span>
          </button>

          <label className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 font-medium text-xs transition-colors border border-slate-800 cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            <span>Restore / Upload .sqlite File</span>
            <input type="file" accept=".sqlite,.db" onChange={handleImportSqliteFile} className="hidden" />
          </label>

          {isAuthenticated && (
            <button
              onClick={handleDownloadFromCloud}
              disabled={isSyncing}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 font-medium text-xs transition-colors border border-slate-800"
            >
              <CloudDownload className="w-3.5 h-3.5 text-sky-400" />
              <span>Pull from pCloud Drive</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const pcloudSyncPlugin: Plugin = {
  metadata: {
    id: 'pcloud-sync',
    name: 'pCloud Storage & Sync',
    version: '1.0.0',
    author: 'PEM Tracker Team',
    description: 'Manages implicit OAuth authentication, pCloud cloud drive sync, and local SQLite caching.',
    icon: 'Cloud',
  },
  initialize(context: PluginContext) {
    // 1. Register Navigation Item
    context.registerNavItem({
      id: 'pcloud-sync',
      label: 'pCloud Drive',
      icon: 'Cloud',
      viewId: 'pcloud-sync',
      order: 40,
    });

    // 2. Register Menu Item
    context.registerMenuItem({
      id: 'menu-pcloud',
      label: 'pCloud Drive Sync & Settings',
      icon: 'Cloud',
      action: () => context.navigateTo('pcloud-sync'),
      order: 40,
    });

    // 3. Register Full View
    context.registerView({
      id: 'pcloud-sync',
      title: 'pCloud Cloud Drive Storage',
      component: PCloudSyncView,
    });
  },
};

export default pcloudSyncPlugin;
