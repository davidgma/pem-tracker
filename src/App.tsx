/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from 'react';
import { pluginRegistry } from './plugins/registry';
import { dbService } from './services/database.service';
import { pcloudService } from './services/pcloud.service';
import {
  HeartPulse,
  Database,
  Globe,
  Cloud,
  Menu,
  X,
  RefreshCw,
  Plus,
  CheckCircle2,
  AlertCircle,
  Info,
  ChevronDown,
  Layers,
} from 'lucide-react';
import { PluginNavItem, PluginMenuItem, AppNotification } from './plugins/plugin.types';
import { SyncStatus } from './types/database.types';

// Icon resolver for dynamic plugin items
const renderIcon = (name: string, className = 'w-4 h-4') => {
  switch (name.toLowerCase()) {
    case 'heartpulse':
    case 'activity':
      return <HeartPulse className={className} />;
    case 'database':
      return <Database className={className} />;
    case 'globe':
      return <Globe className={className} />;
    case 'cloud':
      return <Cloud className={className} />;
    default:
      return <Layers className={className} />;
  }
};

export default function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [navItems, setNavItems] = useState<PluginNavItem[]>([]);
  const [menuItems, setMenuItems] = useState<PluginMenuItem[]>([]);
  const [activeViewId, setActiveViewId] = useState<string>('dashboard');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('offline');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    async function boot() {
      try {
        // 1. Initialize SQLite WASM storage & local cache
        await dbService.initialize();

        // 2. Discover and initialize all plugins in directory
        await pluginRegistry.loadAllPlugins();

        setNavItems(pluginRegistry.getNavItems());
        setMenuItems(pluginRegistry.getMenuItems());
        setActiveViewId(pluginRegistry.getActiveViewId());
        setNotifications(pluginRegistry.getNotifications());
      } catch (err) {
        console.error('Fatal boot error:', err);
      } finally {
        setIsInitializing(false);
      }
    }

    boot();

    // Subscribe to plugin registry updates
    const unsubRegistry = pluginRegistry.subscribe(() => {
      setNavItems([...pluginRegistry.getNavItems()]);
      setMenuItems([...pluginRegistry.getMenuItems()]);
      setActiveViewId(pluginRegistry.getActiveViewId());
      setNotifications([...pluginRegistry.getNotifications()]);
    });

    // Subscribe to pCloud sync status
    const unsubSync = pcloudService.onStatusChange((status) => {
      setSyncStatus(status);
    });

    return () => {
      unsubRegistry();
      unsubSync();
    };
  }, []);

  const handleNavClick = (viewId: string) => {
    pluginRegistry.setActiveView(viewId);
    setActiveViewId(viewId);
    setIsMenuOpen(false);
  };

  const handleManualSync = async () => {
    if (!pcloudService.isAuthenticated()) {
      handleNavClick('pcloud-sync');
      return;
    }
    setIsSyncing(true);
    try {
      await pcloudService.syncWithPCloud();
      pluginRegistry.addNotification(
        'Database Synchronized',
        'SQLite database updated to pCloud drive successfully',
        'success'
      );
    } catch (e: any) {
      pluginRegistry.addNotification('Sync Error', e.message || 'Sync failed', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Find active view component
  const currentView = useMemo(() => {
    return pluginRegistry.getView(activeViewId);
  }, [activeViewId, navItems]);

  const dashboardWidgets = useMemo(() => {
    return pluginRegistry.getDashboardWidgets();
  }, [activeViewId, navItems]);

  const pluginContext = useMemo(() => {
    return pluginRegistry.createPluginContext();
  }, []);

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 space-y-4">
        <div className="relative">
          <div className="h-12 w-12 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 animate-pulse">
            <HeartPulse className="w-6 h-6" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-white">Initializing PEM Tracker</p>
          <p className="text-xs text-slate-500">
            Mounting SQLite3 WASM engine &amp; loading plugins...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Strict Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (4-6 nav links) — Zone 3 (Primary actions) */}
      <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-8">
        <div className="max-w-7xl mx-auto h-16 flex items-center justify-between gap-4">
          {/* Zone 1: Single text element wordmark */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleNavClick('dashboard')}
              className="text-lg font-bold tracking-tight text-white hover:text-teal-400 transition-colors whitespace-nowrap flex items-center gap-2 text-left"
            >
              <div className="h-8 w-8 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
                <HeartPulse className="w-4 h-4" />
              </div>
              <span>PEM Tracker</span>
            </button>
          </div>

          {/* Zone 2: Clean 4–6 text navigation links */}
          <nav className="hidden md:flex items-center gap-1 text-xs font-medium">
            {navItems.map((item) => {
              const isActive = activeViewId === item.viewId;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.viewId)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-teal-500/10 text-teal-400 font-semibold border border-teal-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  {renderIcon(item.icon, 'w-3.5 h-3.5')}
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1–2 primary actions + menu */}
          <div className="flex items-center gap-2 shrink-0">
            {/* pCloud Sync quick status button */}
            <button
              onClick={handleManualSync}
              title={
                pcloudService.isAuthenticated()
                  ? `pCloud: ${syncStatus.toUpperCase()} (Click to sync)`
                  : 'pCloud: Offline / Local Cache (Click to connect)'
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                pcloudService.isAuthenticated()
                  ? 'bg-slate-900 border-teal-500/30 text-teal-300 hover:bg-slate-800'
                  : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-teal-400' : ''}`} />
              <span className="hidden sm:inline">
                {pcloudService.isAuthenticated() ? 'pCloud Synced' : 'Local SQLite'}
              </span>
            </button>

            {/* Main Menu Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-medium transition-colors"
                aria-label="Toggle Plugin Menu"
              >
                <Menu className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Menu</span>
                <ChevronDown className="w-3 h-3 text-slate-500" />
              </button>

              {isMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-2 z-50 text-xs divide-y divide-slate-800/60">
                  <div className="pb-1.5 px-2">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Extensible Plugin Menu
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Discovered plugins register items here
                    </p>
                  </div>

                  <div className="py-1 space-y-0.5">
                    {menuItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          item.action();
                          setIsMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                      >
                        {renderIcon(item.icon, 'w-3.5 h-3.5 text-teal-400')}
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="pt-1.5 px-2 text-[10px] text-slate-500 space-y-1">
                    <div className="flex justify-between">
                      <span>Database Engine:</span>
                      <span className="text-slate-300 font-mono">SQLite3 WASM</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Storage Mutex:</span>
                      <span className="text-teal-400 font-mono">Thread-Safe</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Website:</span>
                      <span className="text-sky-300 font-mono">pem.freshfood.rocks</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Strip */}
      <div className="md:hidden border-b border-slate-800/80 bg-slate-950 px-4 py-2 flex items-center gap-2 overflow-x-auto">
        {navItems.map((item) => {
          const isActive = activeViewId === item.viewId;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.viewId)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap font-medium transition-colors ${
                isActive
                  ? 'bg-teal-500/10 text-teal-400 border border-teal-500/30'
                  : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800/60'
              }`}
            >
              {renderIcon(item.icon, 'w-3 h-3')}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Render Plugin Dashboard Widgets if in Dashboard view */}
        {activeViewId === 'dashboard' && dashboardWidgets.length > 0 && (
          <div className="mb-6 space-y-3">
            {dashboardWidgets.map((widget) => {
              const WidgetComponent = widget.component;
              return <WidgetComponent key={widget.id} context={pluginContext} />;
            })}
          </div>
        )}

        {/* Render Currently Active Plugin View */}
        {currentView ? (
          React.createElement(currentView.component, { context: pluginContext })
        ) : (
          <div className="text-center py-16 text-slate-500 text-xs">
            View not found. Please select a valid option from the menu.
          </div>
        )}
      </main>

      {/* Global Notifications / Toast Center */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {notifications.map((notif) => {
          const getBg = () => {
            switch (notif.type) {
              case 'success':
                return 'bg-slate-900 border-emerald-500/40 text-emerald-200';
              case 'warning':
                return 'bg-slate-900 border-amber-500/40 text-amber-200';
              case 'error':
                return 'bg-slate-900 border-rose-500/40 text-rose-200';
              default:
                return 'bg-slate-900 border-teal-500/40 text-teal-200';
            }
          };

          return (
            <div
              key={notif.id}
              className={`pointer-events-auto rounded-xl border p-4 shadow-2xl backdrop-blur-md flex items-start gap-3 transition-all animate-in slide-in-from-bottom-2 ${getBg()}`}
            >
              <div className="shrink-0 mt-0.5">
                {notif.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                {notif.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400" />}
                {notif.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-400" />}
                {notif.type === 'info' && <Info className="w-4 h-4 text-teal-400" />}
              </div>

              <div className="flex-1 space-y-0.5 text-xs">
                <p className="font-semibold text-white">{notif.title}</p>
                <p className="text-slate-300 leading-relaxed text-[11px]">{notif.message}</p>
              </div>

              <button
                onClick={() => pluginRegistry.dismissNotification(notif.id)}
                className="text-slate-500 hover:text-slate-300 shrink-0 p-1"
                aria-label="Close notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-900 py-6 px-4 text-center text-xs text-slate-500 space-y-1">
        <p>PEM Tracker · Chronic Illness Recovery Pacing &amp; Energy Management</p>
        <p className="text-[11px] text-slate-600">
          Client-side SQLite3 · pCloud Drive Implicit OAuth · Extensible Plugin Architecture
        </p>
      </footer>
    </div>
  );
}
