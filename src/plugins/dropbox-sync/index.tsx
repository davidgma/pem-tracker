/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Plugin, PluginContext } from '../plugin.types';
import {
  FolderSync,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
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
  Download,
  Upload,
  FileCode,
  Copy,
  Check,
} from 'lucide-react';
import { DropboxUser, DropboxSyncLogEntry } from '../../services/dropbox.service';

const DropboxSyncView: React.FC<{ context: PluginContext }> = ({ context }) => {
  const [config, setConfig] = useState(context.dropbox.getConfig());
  const [user, setUser] = useState<DropboxUser | null>(context.dropbox.getCurrentUser());
  const [lastSynced, setLastSynced] = useState<Date | null>(context.dropbox.getLastSynced());
  const [syncStatus, setSyncStatus] = useState<string>(context.dropbox.getSyncStatus());
  const [syncFrequency, setSyncFrequency] = useState<number>(context.dropbox.getSyncInterval() || 120);
  const [customFreqInput, setCustomFreqInput] = useState<string>('');
  const [freqSaved, setFreqSaved] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [dbSize, setDbSize] = useState<number>(0);
  const [syncLogs, setSyncLogs] = useState<DropboxSyncLogEntry[]>(context.dropbox.getSyncLogs());
  const [copiedRedirectUri, setCopiedRedirectUri] = useState(false);

  const redirectUri = window.location.origin + window.location.pathname;

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

    // Load update_frequency setting from t_settings table
    context.database.getSetting('update_frequency', '120').then((val) => {
      if (val) {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed >= 15) {
          setSyncFrequency(parsed);
        }
      }
    });

    const unsubStatus = context.dropbox.onStatusChange((status) => {
      setSyncStatus(status);
      setUser(context.dropbox.getCurrentUser());
      setLastSynced(context.dropbox.getLastSynced());
      setSyncLogs(context.dropbox.getSyncLogs());
    });

    const unsubHistory = context.dropbox.onHistoryChange(() => {
      setSyncLogs(context.dropbox.getSyncLogs());
    });

    return () => {
      unsubStatus();
      unsubHistory();
    };
  }, [context]);

  const handleUpdateFrequency = async (seconds: number) => {
    if (isNaN(seconds) || seconds < 15) return;
    setSyncFrequency(seconds);
    await context.dropbox.setSyncInterval(seconds);
    setFreqSaved(true);
    setTimeout(() => setFreqSaved(false), 2500);
    context.showNotification(
      'Sync Frequency Updated',
      `Auto-sync frequency set to ${seconds}s (saved to t_settings)`,
      'success'
    );
  };

  const handleUpdateConfig = (updates: Partial<typeof config>) => {
    const updated = { ...config, ...updates };
    setConfig(updated);
    context.dropbox.updateConfig(updated);
    context.showNotification('Settings Saved', 'Dropbox synchronization settings updated', 'info');
  };

  const handleOAuthLogin = async () => {
    try {
      context.showNotification('Connecting to Dropbox', 'Redirecting to Dropbox authorization...', 'info');
      await context.dropbox.initiateOAuthLogin();
    } catch (err: any) {
      context.showNotification('OAuth Error', err.message || 'Failed to start OAuth', 'error');
    }
  };

  const handleImplicitLogin = () => {
    context.showNotification('Connecting to Dropbox', 'Opening token authorization...', 'info');
    context.dropbox.initiateImplicitOAuthLogin();
  };

  const handleManualTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;

    try {
      setIsSyncing(true);
      await context.dropbox.connectWithToken(manualToken.trim());
      context.showNotification('Dropbox Connected', 'Authentication successful! Local database synchronized.', 'success');
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
      const res = await context.dropbox.syncWithDropbox();
      if (res.action === 'merged') {
        context.showNotification('Smart Merge Complete', 'Reconciled local and cloud records without data loss.', 'success');
      } else if (res.action === 'downloaded') {
        context.showNotification('Cloud Updates Applied', 'Brought in latest database changes from Dropbox.', 'success');
      } else if (res.action === 'uploaded') {
        context.showNotification('Sync Complete', 'Pushed local database to Dropbox.', 'success');
      } else {
        context.showNotification('Up to Date', 'Local database is in exact sync with Dropbox.', 'info');
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

  const handleExportSqlDump = async () => {
    try {
      const sqlText = await context.database.exportSqlDump();
      const blob = new Blob([sqlText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pem_data_${new Date().toISOString().substring(0, 10)}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      context.showNotification('Exported SQL Dump', 'Downloaded pem_data.sql text file', 'success');
    } catch (err: any) {
      context.showNotification('Export Error', err.message || 'Failed to export SQL dump', 'error');
    }
  };

  const handleImportSqlDump = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = reader.result as string;
        await context.database.importSqlDump(text);
        context.showNotification(
          'SQL Dump Restored',
          `Executed ${file.name} successfully into SQLite engine`,
          'success'
        );
        refreshDbSize();
      } catch (err: any) {
        context.showNotification('Import Failed', err.message || 'Invalid SQL script', 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleLogout = () => {
    if (confirm('Disconnect from Dropbox? Your local cached database will remain intact.')) {
      context.dropbox.logout();
      context.showNotification('Disconnected', 'Logged out of Dropbox session', 'info');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRedirectUri(true);
    setTimeout(() => setCopiedRedirectUri(false), 2000);
  };

  const isAuthenticated = context.dropbox.isAuthenticated();

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FolderSync className="w-6 h-6 text-blue-600" />
            <span>Dropbox Cloud Storage &amp; Sync</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Native CORS, zero-proxy synchronization directly between your in-browser SQLite database and Dropbox folder.
          </p>
        </div>

        {isAuthenticated && (
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 'Dropbox synced' output indicator moved from top row */}
            <div
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap min-h-[38px] shadow-xs ${
                isSyncing || syncStatus === 'syncing'
                  ? 'bg-blue-50 border-blue-200 text-blue-800'
                  : syncStatus === 'conflict'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : syncStatus === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
              title={`Status: ${syncStatus.toUpperCase()}`}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isSyncing || syncStatus === 'syncing'
                    ? 'animate-spin text-blue-600'
                    : syncStatus === 'conflict'
                    ? 'text-amber-600'
                    : syncStatus === 'error'
                    ? 'text-rose-600'
                    : 'text-emerald-600'
                }`}
              />
              <span>
                {isSyncing || syncStatus === 'syncing'
                  ? 'Syncing...'
                  : syncStatus === 'conflict'
                  ? 'Conflict Resolved'
                  : syncStatus === 'error'
                  ? 'Sync Error'
                  : 'Dropbox Synced'}
              </span>
            </div>

            <button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition-colors shadow-sm disabled:opacity-50 min-h-[38px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 transition-colors text-xs font-medium min-h-[38px]"
              title="Log out of Dropbox"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          </div>
        )}
      </div>

      {/* Active Account Status Bar */}
      {isAuthenticated && user && (
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 text-sm">{user.name}</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  Connected
                </span>
              </div>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-600">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Storage</span>
              <span className="font-medium text-slate-800">
                {(user.spaceUsed / (1024 * 1024)).toFixed(1)} MB / {(user.spaceTotal / (1024 * 1024 * 1024)).toFixed(1)} GB
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase tracking-wider font-semibold">Last Cloud Sync</span>
              <span className="font-medium text-slate-800">
                {lastSynced ? lastSynced.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Pending'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Connection Flow (When Not Connected) */}
      {!isAuthenticated && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <FolderSync className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-semibold text-slate-900">Connect to Dropbox</h3>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              Native CORS Support
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            Connect your Dropbox account to automatically synchronize your SQLite database across your Linux desktop, mobile, and browser without any proxy or third-party servers.
          </p>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-700">Your App Redirect URI (for Dropbox Console):</span>
              <button
                type="button"
                onClick={() => copyToClipboard(redirectUri)}
                className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-medium"
              >
                {copiedRedirectUri ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedRedirectUri ? 'Copied!' : 'Copy URI'}</span>
              </button>
            </div>
            <code className="block bg-white border border-slate-300 rounded px-2.5 py-1.5 font-mono text-[11px] text-slate-800 select-all overflow-x-auto">
              {redirectUri}
            </code>
            <p className="text-[11px] text-slate-500">
              Ensure this URL is listed under <strong>OAuth 2 &gt; Redirect URIs</strong> in your Dropbox App Console.
            </p>
          </div>

          <div className="pt-1 flex flex-wrap items-center gap-3">
            <button
              onClick={handleOAuthLogin}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs transition-colors shadow-sm min-h-[42px]"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Sign in with Dropbox (OAuth 2.0 PKCE)</span>
            </button>
            <button
              onClick={handleImplicitLogin}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium text-xs transition-colors shadow-sm min-h-[42px]"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Token Flow Alternative</span>
            </button>
          </div>
        </div>
      )}

      {/* Sync Preferences & Format Selection */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <ArrowDownUp className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">Sync Format &amp; Automation</h3>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              File Format on Dropbox:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <label
                className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                  config.syncFormat === 'sqlite'
                    ? 'border-blue-500 bg-blue-50/40 text-blue-950 ring-1 ring-blue-500'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="syncFormat"
                  value="sqlite"
                  checked={config.syncFormat === 'sqlite'}
                  onChange={() => handleUpdateConfig({ syncFormat: 'sqlite' })}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-xs font-semibold">SQLite Binary (.sqlite)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Fast, raw binary format (<code className="font-mono">pem_database.sqlite</code>). Recommended for Dropbox Linux desktop client.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                  config.syncFormat === 'sql'
                    ? 'border-blue-500 bg-blue-50/40 text-blue-950 ring-1 ring-blue-500'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="syncFormat"
                  value="sql"
                  checked={config.syncFormat === 'sql'}
                  onChange={() => handleUpdateConfig({ syncFormat: 'sql' })}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-xs font-semibold">SQL Script Dump (.sql)</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Human-readable text (<code className="font-mono">pem_data.sql</code>). Can be inspected and run via <code className="font-mono">.read</code>.
                  </div>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                  config.syncFormat === 'both'
                    ? 'border-blue-500 bg-blue-50/40 text-blue-950 ring-1 ring-blue-500'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="syncFormat"
                  value="both"
                  checked={config.syncFormat === 'both'}
                  onChange={() => handleUpdateConfig({ syncFormat: 'both' })}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <div className="text-xs font-semibold">Both Formats</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Maintains both files on Dropbox simultaneously.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={config.autoSync}
                onChange={(e) => handleUpdateConfig({ autoSync: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Enable automatic background push after local edits</span>
            </label>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Dropbox App Key:</span>
              <input
                type="text"
                value={config.appKey}
                onChange={(e) => handleUpdateConfig({ appKey: e.target.value.trim() })}
                className="bg-white border border-slate-300 rounded px-2 py-1 font-mono text-[11px] text-slate-800 w-44"
              />
            </div>
          </div>

          {/* Auto-Sync Frequency Setting (stored in t_settings) */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>Auto-Sync Frequency (stored in database table <code className="font-mono text-blue-700 bg-blue-50 px-1 py-0.5 rounded border border-blue-200">t_settings</code>):</span>
                </label>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Periodic synchronization interval. Default: 120 seconds (2 minutes).
                </p>
              </div>

              {freqSaved && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <Check className="w-3 h-3 text-emerald-600" /> Saved to t_settings
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {[
                { label: '30s', val: 30 },
                { label: '60s (1 min)', val: 60 },
                { label: '120s (2 mins — Default)', val: 120 },
                { label: '300s (5 mins)', val: 300 },
                { label: '600s (10 mins)', val: 600 },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => handleUpdateFrequency(opt.val)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    syncFrequency === opt.val
                      ? 'bg-blue-50 border-blue-400 text-blue-800 font-semibold ring-1 ring-blue-400 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}

              <div className="flex items-center gap-1.5 ml-auto sm:ml-2">
                <span className="text-[11px] text-slate-500">Custom:</span>
                <input
                  type="number"
                  min="15"
                  max="3600"
                  value={customFreqInput}
                  onChange={(e) => setCustomFreqInput(e.target.value)}
                  placeholder={`${syncFrequency}s`}
                  className="w-20 bg-white border border-slate-300 rounded px-2 py-1 text-xs font-mono text-slate-800 text-right"
                />
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parseInt(customFreqInput, 10);
                    if (!isNaN(parsed) && parsed >= 15) {
                      handleUpdateFrequency(parsed);
                      setCustomFreqInput('');
                    }
                  }}
                  disabled={!customFreqInput || isNaN(parseInt(customFreqInput, 10))}
                  className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40 text-xs font-medium border border-slate-300 transition-colors"
                >
                  Set
                </button>
                <span className="text-[11px] text-slate-500">sec</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-0.5">
              <span>Database configuration:</span>
              <code className="font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                t_settings: update_frequency = {syncFrequency}
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Token Fallback Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-slate-600" />
          <h3 className="text-sm font-semibold text-slate-900">Manual Dropbox Token Entry (Optional)</h3>
        </div>
        <p className="text-xs text-slate-500">
          If you generated an access token directly from your Dropbox Developer Console, you can paste it below:
        </p>

        <form onSubmit={handleManualTokenSubmit} className="flex flex-col sm:flex-row gap-2">
          <input
            type="password"
            placeholder="Paste your Dropbox access token here..."
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            className="flex-1 bg-white border border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 font-mono focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
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

      {/* Local SQLite File Management */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">Local SQLite File Management</h3>
          </div>
          <span className="text-xs font-mono text-slate-500">
            Database Size: {(dbSize / 1024).toFixed(1)} KB
          </span>
        </div>

        <p className="text-xs text-slate-500">
          Your database is permanently stored in browser IndexedDB. You can export local backups or restore anytime.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={handleExportLocalSqlite}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium border border-slate-200 transition-colors shadow-sm min-h-[40px]"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Export SQLite (.sqlite)</span>
          </button>

          <label className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium border border-slate-200 transition-colors shadow-sm cursor-pointer min-h-[40px]">
            <Upload className="w-3.5 h-3.5 text-blue-600" />
            <span>Restore / Import (.sqlite)</span>
            <input
              type="file"
              accept=".sqlite,.db"
              onChange={handleImportLocalSqlite}
              className="hidden"
            />
          </label>

          <button
            onClick={handleExportSqlDump}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium border border-slate-200 transition-colors shadow-sm min-h-[40px]"
          >
            <FileCode className="w-3.5 h-3.5 text-indigo-600" />
            <span>Export SQL Dump (.sql)</span>
          </button>

          <label className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-800 text-xs font-medium border border-slate-200 transition-colors shadow-sm cursor-pointer min-h-[40px]">
            <Upload className="w-3.5 h-3.5 text-indigo-600" />
            <span>Restore / Import (.sql)</span>
            <input
              type="file"
              accept=".sql,.txt"
              onChange={handleImportSqlDump}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Multi-Device Collision Avoidance Architecture Info */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2">
          <GitMerge className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-semibold text-slate-900">Multi-Device Collision Avoidance</h3>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          PEM Tracker uses an autonomous reconciliation algorithm to ensure you never lose activity entries or PEM ratings when logging from both Linux desktop and mobile:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
              <Monitor className="w-3.5 h-3.5 text-blue-600" />
              <span>UUID Record Tagging</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Every PEM rating and activity is tagged with a unique client-generated UUID, eliminating conflicting auto-increment ID collisions.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
              <Smartphone className="w-3.5 h-3.5 text-blue-600" />
              <span>Last-Write-Wins (LWW)</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              If the same record is edited on both mobile and desktop before syncing, the most recent timestamp wins automatically.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200/80 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span>Tombstone Deletions</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Deleted rows are recorded in a local tombstone register so remote sync operations never revive records you intended to delete.
            </p>
          </div>
        </div>
      </div>

      {/* Real-time Event Stream / Log */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">Dropbox Sync Event History</h3>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Real-time event stream</span>
        </div>

        {syncLogs.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            No synchronization events recorded in this session.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto pr-1">
            {syncLogs.map((log) => (
              <div key={log.id} className="py-2.5 flex items-start gap-2.5 text-xs">
                <span className="text-slate-400 font-mono text-[11px] pt-0.5 flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {log.timestamp}
                </span>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded font-semibold ${
                        log.type === 'push'
                          ? 'bg-blue-50 text-blue-700'
                          : log.type === 'pull'
                          ? 'bg-emerald-50 text-emerald-700'
                          : log.type === 'merge'
                          ? 'bg-purple-50 text-purple-700'
                          : log.type === 'error'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {log.type}
                    </span>
                    <span className="font-medium text-slate-800">{log.title}</span>
                  </div>
                  {log.details && (
                    <p className="text-[11px] text-slate-500 mt-0.5 font-mono">{log.details}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const dropboxSyncPlugin: Plugin = {
  metadata: {
    id: 'dropbox-sync',
    name: 'Dropbox Cloud Storage Sync',
    version: '1.0.0',
    description: 'Synchronizes SQLite database directly with Dropbox App folder using native CORS and OAuth 2.0 PKCE.',
    icon: 'FolderSync',
  },
  initialize(context: PluginContext) {
    // 1. Register Nav Bar Link
    context.registerNavItem({
      id: 'dropbox-sync',
      label: 'Dropbox Drive',
      icon: 'FolderSync',
      viewId: 'dropbox-sync',
      order: 40,
    });

    // 2. Register Menu Item
    context.registerMenuItem({
      id: 'menu-dropbox-sync',
      label: 'Dropbox Settings',
      icon: 'FolderSync',
      action: () => context.navigateTo('dropbox-sync'),
      order: 30,
    });

    // 3. Register Dedicated View
    context.registerView({
      id: 'dropbox-sync',
      title: 'Dropbox Storage & Synchronization',
      component: DropboxSyncView,
    });
  },
};

export default dropboxSyncPlugin;
