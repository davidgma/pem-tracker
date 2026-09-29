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
  Smartphone,
  Monitor,
  GitMerge,
  Radio,
  Clock,
  ArrowDownUp,
} from 'lucide-react';
import { PCloudUser, SyncLogEntry } from '../../services/pcloud.service';

const PCloudSyncView: React.FC<{ context: PluginContext }> = ({ context }) => {
  const [config, setConfig] = useState(context.pcloud.getConfig());
  const [user, setUser] = useState<PCloudUser | null>(context.pcloud.getCurrentUser());
  const [lastSynced, setLastSynced] = useState<Date | null>(context.pcloud.getLastSynced());
  const [isSyncing, setIsSyncing] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [dbSize, setDbSize] = useState<number>(0);
  const [syncLogs, setSyncLogs] = useState<SyncLogEntry[]>(context.pcloud.getSyncLogs());

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
    const unsubStatus = context.pcloud.onStatusChange(() => {
      setUser(context.pcloud.getCurrentUser());
      setLastSynced(context.pcloud.getLastSynced());
      setSyncLogs(context.pcloud.getSyncLogs());
    });

    const unsubHistory = context.pcloud.onHistoryChange(() => {
      setSyncLogs(context.pcloud.getSyncLogs());
    });

    return () => {
      unsubStatus();
      unsubHistory();
    };
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
      const res = await context.pcloud.syncWithPCloud();
      if (res.action === 'merged') {
        context.showNotification('Smart Merge Complete', 'Reconciled local and cloud records without data loss.', 'success');
      } else if (res.action === 'downloaded') {
        context.showNotification('Cloud Updates Applied', 'Brought in latest database changes from another device.', 'success');
      } else if (res.action === 'uploaded') {
        context.showNotification('Sync Complete', 'Pushed local database to pCloud drive.', 'success');
      } else {
        context.showNotification('Up to Date', 'Local database is already in exact sync with pCloud.', 'info');
      }
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
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Cloud className="w-5 h-5 text-teal-600" />
            <span>Multi-Device pCloud Cloud Synchronization</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time two-way synchronization with conflict avoidance for seamless switching between desktop and phone.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <>
              <button
                onClick={handleSyncNow}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium text-xs transition-colors shadow-sm min-h-[42px]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : 'Check & Sync Now'}</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-rose-600 text-xs font-medium border border-slate-200 transition-colors shadow-sm min-h-[42px]"
                title="Disconnect pCloud"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Disconnect</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => handleOAuthLogin('us')}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs transition-colors shadow-sm min-h-[42px]"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Sign in with pCloud</span>
            </button>
          )}
        </div>
      </div>

      {/* Multi-Device Architecture Explanation Banner */}
      <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-5 space-y-3">
        <div className="flex items-center gap-2 text-teal-900 font-semibold text-sm">
          <ArrowDownUp className="w-4 h-4 text-teal-600" />
          <span>Desktop $\rightleftharpoons$ Mobile Continuous Sync Architecture</span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          Designed specifically for pacing recovery workflows across multiple devices. You can log activities on your desktop at home, record symptom ratings on your mobile phone while on the move, and seamlessly return to your desktop.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
          <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900">
              <Upload className="w-3.5 h-3.5 text-teal-600" />
              <span>Reactive Auto-Push</span>
            </div>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              Every local update (activity or PEM score) is debounced and immediately pushed to your pCloud database file.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900">
              <Radio className="w-3.5 h-3.5 text-sky-600" />
              <span>Cloud Change Monitor</span>
            </div>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              Monitors the cloud timestamp and hash every 20s, and checks immediately whenever you unlock your phone or switch browser tabs.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-slate-900">
              <GitMerge className="w-3.5 h-3.5 text-purple-600" />
              <span>Collision Avoidance</span>
            </div>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              If both devices make offline updates, a smart two-way merge combines records without data loss using Last-Write-Wins and tombstone deletion tracking.
            </p>
          </div>
        </div>
      </div>

      {/* Account Info Card (When authenticated) */}
      {isAuthenticated && user && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600 font-bold text-sm shrink-0">
                {user.email.substring(0, 2).toUpperCase()}
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
                Storage Quota:{' '}
                <strong className="text-slate-700 font-mono">
                  {(user.usedquota / (1024 * 1024)).toFixed(1)} MB
                </strong>{' '}
                /{' '}
                <strong className="text-slate-700 font-mono">
                  {(user.quota / (1024 * 1024 * 1024)).toFixed(1)} GB
                </strong>
              </p>
              <p className="text-[11px] text-teal-600 font-medium flex items-center sm:justify-end gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                <span>{lastSynced ? `Last Synced: ${lastSynced.toLocaleTimeString()}` : 'Syncing in progress...'}</span>
              </p>
            </div>
          </div>

          {/* Real-Time Sync Event Log */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>Multi-Device Sync Event History</span>
              </p>
              <span className="text-[10px] text-slate-400 font-mono">Real-time event stream</span>
            </div>

            {syncLogs.length === 0 ? (
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-center text-xs text-slate-400">
                No sync events recorded yet. Updates will appear here automatically as changes occur.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg bg-slate-50/50 text-xs">
                {syncLogs.map((log) => {
                  const getBadge = () => {
                    switch (log.type) {
                      case 'push':
                        return <span className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 font-semibold text-[10px]">PUSHED</span>;
                      case 'pull':
                        return <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800 font-semibold text-[10px]">PULLED</span>;
                      case 'merge':
                        return <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-semibold text-[10px]">MERGED</span>;
                      case 'check':
                        return <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold text-[10px]">COLLISION DETECTED</span>;
                      default:
                        return <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 font-semibold text-[10px]">ERROR</span>;
                    }
                  };

                  return (
                    <div key={log.id} className="p-2.5 flex items-start justify-between gap-3 bg-white">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          {getBadge()}
                          <span className="font-medium text-slate-800 text-[11px]">{log.summary}</span>
                        </div>
                        {log.details && (
                          <p className="text-[11px] text-slate-500 leading-snug">{log.details}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap shrink-0">
                        {log.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* OAuth Configuration Details */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-teal-600" />
            <h3 className="text-sm font-semibold text-slate-900">pCloud OAuth 2.0 Implicit Settings</h3>
          </div>
          <span className="text-xs font-mono text-slate-500">Direct Client-Side Token Flow</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5">
            <label className="text-slate-700 font-medium">pCloud Client ID (App ID)</label>
            <input
              type="text"
              value={config.clientId}
              onChange={(e) => handleUpdateConfig({ clientId: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 font-mono focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
            />
            <p className="text-[11px] text-slate-400">Registered App Client ID: cQmzJUo7RiJ</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-slate-700 font-medium">Redirect URI</label>
            <input
              type="text"
              value={config.redirectUri}
              onChange={(e) => handleUpdateConfig({ redirectUri: e.target.value })}
              className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 font-mono focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
            />
            <div className="flex items-center gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => handleUpdateConfig({ redirectUri: 'https://pem.freshfood.rocks' })}
                className="text-[11px] text-teal-600 hover:underline"
              >
                Set Production (pem.freshfood.rocks)
              </button>
              <span className="text-slate-400">·</span>
              <button
                type="button"
                onClick={() => handleUpdateConfig({ redirectUri: window.location.origin })}
                className="text-[11px] text-slate-500 hover:text-slate-800 hover:underline"
              >
                Set Current Origin ({window.location.host})
              </button>
            </div>
          </div>
        </div>

        <div className="pt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleOAuthLogin('us')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs transition-colors shadow-sm min-h-[42px]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Sign in with pCloud (Global)</span>
          </button>
          <button
            onClick={() => handleOAuthLogin('eu')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs transition-colors shadow-sm min-h-[42px]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Sign in (European Region)</span>
          </button>
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
    version: '1.1.0',
    description: 'Synchronizes SQLite database with personal pCloud drive using OAuth 2.0 implicit grant, auto-push, and collision avoidance.',
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
