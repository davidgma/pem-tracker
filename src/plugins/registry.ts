/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Plugin,
  PluginContext,
  PluginDashboardWidget,
  PluginMenuItem,
  PluginNavItem,
  PluginView,
  AppNotification,
} from './plugin.types';
import { dbService } from '../services/database.service';
import { pcloudService } from '../services/pcloud.service';

export class PluginRegistry {
  private static instance: PluginRegistry;
  private plugins: Map<string, Plugin> = new Map();
  private navItems: PluginNavItem[] = [];
  private menuItems: PluginMenuItem[] = [];
  private views: Map<string, PluginView> = new Map();
  private dashboardWidgets: PluginDashboardWidget[] = [];
  private notifications: AppNotification[] = [];
  private activeViewId: string = 'dashboard';
  private listeners: Set<() => void> = new Set();
  private isLoaded = false;

  private constructor() {}

  public static getInstance(): PluginRegistry {
    if (!PluginRegistry.instance) {
      PluginRegistry.instance = new PluginRegistry();
    }
    return PluginRegistry.instance;
  }

  /**
   * Automatically discovers and loads all plugins in the plugins directory at startup
   */
  public async loadAllPlugins(): Promise<void> {
    if (this.isLoaded) return;

    // Vite automatic directory glob discovery: looks for all plugins in subdirectories of /plugins/
    const pluginModules = import.meta.glob<{ default?: Plugin; plugin?: Plugin }>(
      './*/index.{ts,tsx}',
      { eager: true }
    );

    const context = this.createPluginContext();

    for (const path in pluginModules) {
      const module = pluginModules[path];
      const plugin = module.default || module.plugin;
      if (plugin && plugin.metadata && plugin.metadata.id) {
        this.plugins.set(plugin.metadata.id, plugin);
      }
    }

    // Initialize all discovered plugins
    for (const [id, plugin] of this.plugins.entries()) {
      try {
        await plugin.initialize(context);
        if (plugin.onDatabaseReady) {
          plugin.onDatabaseReady(dbService);
        }
      } catch (err) {
        console.error(`Failed to initialize plugin ${id}:`, err);
      }
    }

    // Sort navigation items by order
    this.navItems.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    this.menuItems.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    this.dashboardWidgets.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

    this.isLoaded = true;
    this.notify();
  }

  public createPluginContext(): PluginContext {
    return {
      database: dbService,
      pcloud: pcloudService,
      registerNavItem: (item: PluginNavItem) => {
        const existingIdx = this.navItems.findIndex((n) => n.id === item.id);
        if (existingIdx >= 0) {
          this.navItems[existingIdx] = item;
        } else {
          this.navItems.push(item);
        }
        this.navItems.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        this.notify();
      },
      registerMenuItem: (item: PluginMenuItem) => {
        const existingIdx = this.menuItems.findIndex((m) => m.id === item.id);
        if (existingIdx >= 0) {
          this.menuItems[existingIdx] = item;
        } else {
          this.menuItems.push(item);
        }
        this.menuItems.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        this.notify();
      },
      registerView: (view: PluginView) => {
        this.views.set(view.id, view);
        this.notify();
      },
      registerDashboardWidget: (widget: PluginDashboardWidget) => {
        const existingIdx = this.dashboardWidgets.findIndex((w) => w.id === widget.id);
        if (existingIdx >= 0) {
          this.dashboardWidgets[existingIdx] = widget;
        } else {
          this.dashboardWidgets.push(widget);
        }
        this.dashboardWidgets.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
        this.notify();
      },
      showNotification: (
        title: string,
        message: string,
        type: 'info' | 'success' | 'warning' | 'error' = 'info'
      ) => {
        this.addNotification(title, message, type);
      },
      navigateTo: (viewId: string) => {
        this.setActiveView(viewId);
      },
      get activeViewId() {
        return PluginRegistry.getInstance().getActiveViewId();
      },
    };
  }

  public addNotification(
    title: string,
    message: string,
    type: 'info' | 'success' | 'warning' | 'error' = 'info'
  ) {
    const notif: AppNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title,
      message,
      type,
      timestamp: Date.now(),
    };
    this.notifications.unshift(notif);
    this.notify();

    // Auto dismiss after 7s
    setTimeout(() => {
      this.dismissNotification(notif.id);
    }, 7000);
  }

  public dismissNotification(id: string) {
    this.notifications = this.notifications.filter((n) => n.id !== id);
    this.notify();
  }

  public getNotifications(): AppNotification[] {
    return this.notifications;
  }

  public getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  public getNavItems(): PluginNavItem[] {
    return this.navItems;
  }

  public getMenuItems(): PluginMenuItem[] {
    return this.menuItems;
  }

  public getViews(): Map<string, PluginView> {
    return this.views;
  }

  public getView(id: string): PluginView | undefined {
    return this.views.get(id);
  }

  public getDashboardWidgets(): PluginDashboardWidget[] {
    return this.dashboardWidgets;
  }

  public getActiveViewId(): string {
    return this.activeViewId;
  }

  public setActiveView(viewId: string): void {
    if (this.activeViewId !== viewId) {
      this.activeViewId = viewId;
      this.notify();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (e) {
        console.error('Error notifying plugin registry listener:', e);
      }
    });
  }
}

export const pluginRegistry = PluginRegistry.getInstance();
