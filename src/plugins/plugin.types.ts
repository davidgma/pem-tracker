/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { DatabaseService } from '../services/database.service';
import { PCloudService } from '../services/pcloud.service';

export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  icon?: string;
  isRemovable?: boolean;
}

export interface PluginNavItem {
  id: string;
  label: string;
  icon: string; // Lucide icon name
  viewId: string;
  badge?: string;
  order?: number;
}

export interface PluginMenuItem {
  id: string;
  label: string;
  icon: string;
  action: () => void;
  order?: number;
}

export interface PluginDashboardWidget {
  id: string;
  title: string;
  description?: string;
  component: React.ComponentType<{ context: PluginContext }>;
  span?: 1 | 2 | 3;
  order?: number;
}

export interface PluginView {
  id: string;
  title: string;
  component: React.ComponentType<{ context: PluginContext }>;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  timestamp: number;
}

export interface PluginContext {
  database: DatabaseService;
  pcloud: PCloudService;
  registerNavItem(item: PluginNavItem): void;
  registerMenuItem(item: PluginMenuItem): void;
  registerView(view: PluginView): void;
  registerDashboardWidget(widget: PluginDashboardWidget): void;
  showNotification(title: string, message: string, type?: 'info' | 'success' | 'warning' | 'error'): void;
  navigateTo(viewId: string): void;
  activeViewId: string;
}

export interface Plugin {
  metadata: PluginMetadata;
  initialize(context: PluginContext): Promise<void> | void;
  destroy?(): void;
  onDatabaseReady?(db: DatabaseService): void;
}
