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
        // 1. Discover and initialize all plugins FIRST so navigation and views are registered immediately
        await pluginRegistry.loadAllPlugins();

        setNavItems(pluginRegistry.getNavItems());
        setMenuItems(pluginRegistry.getMenuItems());
        setActiveViewId(pluginRegistry.getActiveViewId());
        setNotifications(pluginRegistry.getNotifications());

        // 2. Initialize SQLite WASM storage & local cache
        await dbService.initialize();

        // 3. Initialize startup sync (fetch from shared link or remote cloud if configured)
        await pcloudService.initializeStartupSync();
      } catch (err) {
        console.error('Initialization error:', err);
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

  // Find active view component with automatic fallback to dashboard
  const currentView = useMemo(() => {
    const view = pluginRegistry.getView(activeViewId);
    if (!view) {
      return pluginRegistry.getView('dashboard') || Array.from(pluginRegistry.getViews().values())[0];
    }
    return view;
  }, [activeViewId, navItems]);

  const dashboardWidgets = useMemo(() => {
    return pluginRegistry.getDashboardWidgets();
  }, [activeViewId, navItems]);

  const pluginContext = useMemo(() => {
    return pluginRegistry.createPluginContext();
  }, []);

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-700 space-y-4 px-4 font-sans">
        <div className="relative">
          <div className="h-12 w-12 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600 animate-pulse shadow-sm">
            <HeartPulse className="w-6 h-6" />
          </div>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-slate-900">Initializing PEM Tracker</p>
          <p className="text-xs text-slate-500">
            Loading plugins &amp; preparing SQLite3 engine...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-teal-600 selection:text-white">
      {/* Strict Top Bar Contract: Zone 1 (Wordmark) — Zone 2 (4-6 nav links) — Zone 3 (Primary actions) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 sm:px-6 lg:px-8 shadow-xs">
        <div className="max-w-7xl mx-auto h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Zone 1: Single text element wordmark */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleNavClick('dashboard')}
              className="text-base sm:text-lg font-bold tracking-tight text-slate-900 hover:text-teal-700 transition-colors whitespace-nowrap flex items-center gap-2.5 text-left min-h-[44px]"
            >
              <div className="h-8 w-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600 shrink-0 shadow-xs">
                <HeartPulse className="w-4 h-4" />
              </div>
              <span className="tracking-tight text-slate-900">PEM Tracker</span>
            </button>
          </div>

          {/* Zone 2: Clean 4–6 text navigation links (Desktop) */}
          <nav className="hidden md:flex items-center gap-1.5 text-xs font-medium">
            {navItems.map((item) => {
              const isActive = activeViewId === item.viewId;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.viewId)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap min-h-[40px] ${
                    isActive
                      ? 'bg-teal-50 text-teal-800 font-semibold border border-teal-200 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {renderIcon(item.icon, `w-3.5 h-3.5 ${isActive ? 'text-teal-700' : 'text-slate-500'}`)}
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1–2 primary actions + menu */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* pCloud Sync quick status button */}
            <button
              onClick={handleManualSync}
              title={
                pcloudService.isAuthenticated()
                  ? `pCloud: ${syncStatus.toUpperCase()} (Click to check/sync)`
                  : 'pCloud: Local Mode (Click to connect)'
              }
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap min-h-[40px] shadow-xs ${
                pcloudService.isAuthenticated()
                  ? syncStatus === 'pending'
                    ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                    : syncStatus === 'merging'
                    ? 'bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100'
                    : 'bg-teal-50 border-teal-200 text-teal-800 hover:bg-teal-100'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isSyncing || syncStatus === 'syncing' || syncStatus === 'merging'
                    ? 'animate-spin text-teal-600'
                    : syncStatus === 'pending'
                    ? 'text-amber-600'
                    : 'text-teal-600'
                }`}
              />
              <span className="hidden sm:inline">
                {pcloudService.isAuthenticated()
                  ? syncStatus === 'pending'
                    ? 'Auto-Pushing...'
                    : syncStatus === 'merging'
                    ? 'Merging Devices...'
                    : syncStatus === 'syncing'
                    ? 'Syncing...'
                    : 'pCloud Synced'
                  : 'Local SQLite'}
              </span>
            </button>

            {/* Main Menu Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium transition-colors min-h-[40px] shadow-xs"
                aria-label="Toggle Plugin Menu"
              >
                <Menu className="w-4 h-4 text-slate-600" />
                <span className="hidden sm:inline">Menu</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {isMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl bg-white border border-slate-200 shadow-xl p-2 z-50 text-xs divide-y divide-slate-100">
                  <div className="pb-1.5 px-2">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Extensible Plugin Menu
                    </p>
                    <p className="text-[10px] text-slate-400">
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
                        className="w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-left text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors min-h-[40px]"
                      >
                        {renderIcon(item.icon, 'w-3.5 h-3.5 text-teal-600')}
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="pt-1.5 px-2 text-[10px] text-slate-500 space-y-1">
                    <div className="flex justify-between">
                      <span>Database Engine:</span>
                      <span className="text-slate-800 font-mono font-medium">SQLite3 WASM</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Storage Mutex:</span>
                      <span className="text-teal-700 font-mono font-medium">Thread-Safe</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Target Host:</span>
                      <span className="text-indigo-600 font-mono">pem.freshfood.rocks</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Strip (Touch-optimized horizontal scroll) */}
      <div className="md:hidden border-b border-slate-200 bg-white px-3 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar shadow-xs">
        {navItems.map((item) => {
          const isActive = activeViewId === item.viewId;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.viewId)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs whitespace-nowrap font-medium transition-colors min-h-[40px] shrink-0 ${
                isActive
                  ? 'bg-teal-50 text-teal-800 border border-teal-200 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 bg-slate-50 border border-slate-200'
              }`}
            >
              {renderIcon(item.icon, `w-3.5 h-3.5 ${isActive ? 'text-teal-700' : 'text-slate-500'}`)}
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Responsive Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
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
            Loading view...
          </div>
        )}
      </main>

      {/* Global Notifications / Toast Center (Light Theme) */}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 flex flex-col gap-2 max-w-sm w-auto pointer-events-none">
        {notifications.map((notif) => {
          const getBg = () => {
            switch (notif.type) {
              case 'success':
                return 'bg-white border-emerald-300 text-emerald-950 shadow-lg';
              case 'warning':
                return 'bg-white border-amber-300 text-amber-950 shadow-lg';
              case 'error':
                return 'bg-white border-rose-300 text-rose-950 shadow-lg';
              default:
                return 'bg-white border-teal-300 text-teal-950 shadow-lg';
            }
          };

          return (
            <div
              key={notif.id}
              className={`pointer-events-auto rounded-xl border p-3.5 sm:p-4 shadow-lg backdrop-blur-md flex items-start gap-3 transition-all animate-in slide-in-from-bottom-2 ${getBg()}`}
            >
              <div className="shrink-0 mt-0.5">
                {notif.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                {notif.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600" />}
                {notif.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-600" />}
                {notif.type === 'info' && <Info className="w-4 h-4 text-teal-600" />}
              </div>

              <div className="flex-1 space-y-0.5 text-xs">
                <p className="font-semibold text-slate-900">{notif.title}</p>
                <p className="text-slate-600 leading-relaxed text-[11px]">{notif.message}</p>
              </div>

              <button
                onClick={() => pluginRegistry.dismissNotification(notif.id)}
                className="text-slate-400 hover:text-slate-600 shrink-0 p-1 min-h-[32px] min-w-[32px] flex items-center justify-center"
                aria-label="Close notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
