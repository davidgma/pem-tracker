/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Plugin, PluginContext } from '../plugin.types';
import {
  Cloud,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Lock,
  Download,
  Upload,
  Globe,
  HardDrive,
  LogOut,
  ExternalLink,
  Shield,
  Key,
} from 'lucide-react';
import { PCloudUser } from '../../services/pcloud.service';

const PCloudSyncView: React.FC<{ context: PluginContext }> = ({ context }) => {
  const [config, setConfig] = useState(context.pcloud.getConfig());
  const [user, setUser] = useState<PCloudUser | null>(context.pcloud.getCurrentUser());
  const [lastSynced, setLastSynced] = useState<Date | null>(context.pcloud.getLastSynced());
  const [isSyncing, setIsSyncing] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [dbSize, setDbSize] = useState<number>(0);

  const refreshDbSize = async () => {
    try {
      const data = await context.database.exportDatabase();
      setDbSize(data.byteLength);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshDbSize();
    const unsub = context.pcloud.onStatusChange(() => {
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
      context.showNotification('Connection Error', err.message || 'Failed to authenticate token', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncNow = async () => {
    try {
      setIsSyncing(true);
      await context.pcloud.syncWithPCloud();
      context.showNotification('Sync Complete', 'Local SQLite database synchronized with pCloud drive', 'success');
      refreshDbSize();
    } catch (err: any) {
      context.showNotification('Sync Error', err.message || 'Sync failed', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportLocalSqlite = async () => {
    try {
      const data = await context.database.exportDatabase();
      const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pem_tracker_${new Date().toISOString().substring(0, 10)}.sqlite`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      context.showNotification('Exported', 'Downloaded SQLite database file', 'success');
    } catch (err: any) {
      context.showNotification('Export Error', err.message || 'Failed to export database', 'error');
    }
  };

  const handleImportLocalSqlite = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Cloud className="w-5 h-5 text-teal-600" />
              <span>pCloud Drive &amp; Implicit Grant Storage</span>
            </h2>
            <span
              className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                isAuthenticated
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {isAuthenticated ? 'Connected to pCloud' : 'Local Offline Mode'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Client-side SQLite3 synchronization with personal pCloud cloud drive. Implicit OAuth grant ensures zero secret keys are exposed.
          </p>
        </div>

        {isAuthenticated && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-sm min-h-[40px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync with pCloud'}</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-600 hover:text-rose-600 border border-slate-200 text-xs transition-colors shadow-sm min-h-[40px]"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          </div>
        )}
      </div>

      {/* Account Info Banner if authenticated */}
      {isAuthenticated && user && (
        <div className="rounded-xl bg-white border border-slate-200 p-5 space-y-3 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-base">
                {user.email.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{user.email}</p>
                <p className="text-xs text-slate-500 font-mono">
                  pCloud User ID: {user.userid} · Remote path:{' '}
                  <span className="text-teal-700 font-medium">/PEMTracker/pem_database.sqlite</span>
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right text-xs text-slate-500">
              <p>
                Quota:{' '}
                <strong className="text-slate-900 font-mono">
                  {(user.usedquota / (1024 * 1024)).toFixed(1)} MB
                </strong>{' '}
                /{' '}
                <strong className="text-slate-900 font-mono">
                  {(user.quota / (1024 * 1024 * 1024)).toFixed(1)} GB
                </strong>
              </p>
              <p className="text-[11px] text-teal-700 font-medium">
                {lastSynced ? `Last Synced: ${lastSynced.toLocaleTimeString()}` : 'Sync pending'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* OAuth Implicit Grant Configuration */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-teal-600" />
            <h3 className="text-base font-semibold text-slate-900">OAuth 2.0 Implicit Grant Workflow</h3>
          </div>
          <span className="text-xs font-mono text-slate-500">Direct Client-Side Token Flow</span>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          In OAuth 2.0 Implicit Grant, your browser redirects directly to pCloud to authorize access.
          pCloud returns the access token inside the URI fragment (<code>#access_token=...</code>).
          The application securely scrubs the token from the address bar immediately upon return, ensuring complete privacy with zero server secrets.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-slate-700 font-medium">pCloud Client ID (App ID)</label>
            <input
              type="text"
              value={config.clientId}
              onChange={(e) => handleUpdateConfig({ clientId: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
            />
            <p className="text-[11px] text-slate-500">Provided API Client ID: <span className="font-mono text-slate-700 font-semibold">cQmzJUo7RiJ</span></p>
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-700 font-medium">Redirect URI</label>
            <input
              type="text"
              value={config.redirectUri}
              onChange={(e) => handleUpdateConfig({ redirectUri: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 font-mono focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
            />
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => handleUpdateConfig({ redirectUri: 'https://pem.freshfood.rocks' })}
                className="text-[11px] text-teal-700 hover:text-teal-900 font-medium hover:underline"
              >
                Set Production (pem.freshfood.rocks)
              </button>
              <span className="text-slate-300">·</span>
              <button
                type="button"
                onClick={() => handleUpdateConfig({ redirectUri: window.location.origin })}
                className="text-[11px] text-slate-500 hover:text-slate-800 hover:underline"
              >
                Set Current Host ({window.location.host})
              </button>
            </div>
          </div>
        </div>

        {/* Region & Implicit Auth Action */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-xs text-slate-700">
            <span className="font-medium text-slate-600">pCloud Server Location:</span>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="region"
                checked={config.region === 'us'}
                onChange={() => handleUpdateConfig({ region: 'us' })}
                className="accent-teal-600"
              />
              <span>Global / US (api.pcloud.com)</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="region"
                checked={config.region === 'eu'}
                onChange={() => handleUpdateConfig({ region: 'eu' })}
                className="accent-teal-600"
              />
              <span>Europe (eapi.pcloud.com)</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOAuthLogin('us')}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs transition-colors shadow-sm min-h-[42px]"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Sign in with pCloud</span>
            </button>
            {config.region === 'eu' && (
              <button
                onClick={() => handleOAuthLogin('eu')}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs transition-colors shadow-sm min-h-[42px]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Sign in (EU Server)</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Manual Token Fallback Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-900">Manual OAuth Token Entry (Optional)</h3>
        </div>
        <p className="text-xs text-slate-500">
          If you already have a generated pCloud bearer token, you can paste it directly below without redirecting.
        </p>

        <form onSubmit={handleManualTokenSubmit} className="flex flex-col sm:flex-row gap-2">
          <input
            type="password"
            placeholder="Paste your pCloud OAuth token here..."
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            className="flex-1 bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
          />
          <button
            type="submit"
            disabled={!manualToken.trim() || isSyncing}
            className="px-4 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-800 disabled:opacity-50 text-xs font-medium border border-slate-200 transition-colors shadow-sm whitespace-nowrap min-h-[40px]"
          >
            Connect Token
          </button>
        </form>
      </div>

      {/* Local SQLite Backup & Restore Utilities */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-semibold text-slate-900">Local SQLite File Management</h3>
          </div>
          <span className="text-xs font-mono text-slate-500">
            Database Size: {(dbSize / 1024).toFixed(1)} KB
          </span>
        </div>

        <p className="text-xs text-slate-500">
          Even without pCloud, your database is permanently cached in IndexedDB within your browser. You can export manual backups or restore an existing database anytime.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={handleExportLocalSqlite}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium border border-slate-200 transition-colors shadow-sm min-h-[40px]"
          >
            <Download className="w-3.5 h-3.5 text-teal-600" />
            <span>Export Database (.sqlite)</span>
          </button>

          <label className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium border border-slate-200 transition-colors shadow-sm cursor-pointer min-h-[40px]">
            <Upload className="w-3.5 h-3.5 text-sky-600" />
            <span>Restore / Import (.sqlite)</span>
            <input
              type="file"
              accept=".sqlite,.db"
              onChange={handleImportLocalSqlite}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
};

export const pcloudSyncPlugin: Plugin = {
  metadata: {
    id: 'pcloud-sync',
    name: 'pCloud Storage Sync',
    version: '1.0.0',
    description: 'Synchronizes SQLite database with personal pCloud drive using OAuth 2.0 implicit grant.',
    icon: 'Cloud',
  },
  initialize(context: PluginContext) {
    // 1. Register Nav Bar Link
    context.registerNavItem({
      id: 'pcloud-sync',
      label: 'pCloud Drive',
      icon: 'Cloud',
      viewId: 'pcloud-sync',
      order: 40,
    });

    // 2. Register Menu Item
    context.registerMenuItem({
      id: 'menu-pcloud-sync',
      label: 'pCloud Drive Settings',
      icon: 'Cloud',
      action: () => context.navigateTo('pcloud-sync'),
      order: 30,
    });

    // 3. Register Dedicated View
    context.registerView({
      id: 'pcloud-sync',
      title: 'pCloud Storage & Synchronization',
      component: PCloudSyncView,
    });
  },
};

export default pcloudSyncPlugin;
