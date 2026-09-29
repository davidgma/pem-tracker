/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Plugin, PluginContext } from '../plugin.types';
import { Globe, Sparkles, CheckCircle2, Database, Layers, ArrowRight, ShieldCheck } from 'lucide-react';

const STORAGE_KEY_SEEN = 'pem_hello_world_seen';

/**
 * Hello World Plugin Component
 */
const HelloWorldView: React.FC<{ context: PluginContext }> = ({ context }) => {
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [pemCount, setPemCount] = useState<number>(0);
  const [actCount, setActCount] = useState<number>(0);

  useEffect(() => {
    async function checkDb() {
      try {
        const pems = await context.database.getAllPEMs();
        const acts = await context.database.getAllActivities();
        setPemCount(pems.length);
        setActCount(acts.length);
        setDbStatus('connected');
      } catch (e) {
        console.error('DB check failed in Hello World plugin:', e);
        setDbStatus('error');
      }
    }
    checkDb();
  }, [context]);

  const triggerToastGreeting = () => {
    context.showNotification(
      'Hello World from Plugin System!',
      'This greeting was dispatched dynamically by the Hello World plugin through the thread-safe PluginContext.',
      'info'
    );
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-4">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-teal-950 border border-teal-500/20 p-8 shadow-xl">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-400">
              <Sparkles className="w-4 h-4 text-teal-400" />
              <span>Plugin System Online</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400 font-mono">v1.0.0</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Hello World! Welcome to PEM Tracker
            </h1>
            <p className="text-base text-slate-300 max-w-2xl leading-relaxed">
              Your personalized pacing and energy expenditure companion for chronic illness recovery.
              The application has automatically discovered and initialized its extensible plugin directory,
              bootstrapped an abstracted thread-safe SQLite3 database, and prepared pCloud implicit grant storage.
            </p>
          </div>
          <div className="hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
            <Globe className="w-7 h-7" />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            onClick={triggerToastGreeting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-sm transition-colors shadow-sm"
          >
            <span>Trigger Hello World Toast</span>
            <Sparkles className="w-4 h-4" />
          </button>
          <button
            onClick={() => context.navigateTo('dashboard')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm transition-colors border border-slate-700"
          >
            <span>Go to Pacing Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => context.navigateTo('sql-console')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-sm transition-colors border border-slate-700"
          >
            <span>Open SQL Query Console</span>
            <Database className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Plugin Architecture Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Plugin Discovery</span>
            <Layers className="w-4 h-4 text-teal-400" />
          </div>
          <p className="text-lg font-semibold text-white">Dynamic Auto-Loader</p>
          <p className="text-xs text-slate-400 leading-normal">
            Scans <code className="text-teal-300 font-mono">src/plugins/*/index.ts</code> at startup and registers nav links, menus, widgets, and routes automatically.
          </p>
        </div>

        <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Main Program Database</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-lg font-semibold text-white">SQLite3 WASM Storage</p>
          <p className="text-xs text-slate-400 leading-normal">
            Thread-safe abstracted storage mutex. Currently storing{' '}
            <span className="text-emerald-400 font-mono font-medium">{pemCount}</span> PEM logs and{' '}
            <span className="text-emerald-400 font-mono font-medium">{actCount}</span> activities.
          </p>
        </div>

        <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Cloud Storage Sync</span>
            <ShieldCheck className="w-4 h-4 text-sky-400" />
          </div>
          <p className="text-lg font-semibold text-white">pCloud Implicit Grant</p>
          <p className="text-xs text-slate-400 leading-normal">
            Client ID <code className="text-sky-300 font-mono">cQmzJUo7RiJ</code> with hash fragment token extraction for private cloud storage without exposing secret keys.
          </p>
        </div>
      </div>

      {/* Chronic Illness Recovery Guidance */}
      <div className="rounded-xl bg-slate-900/50 border border-slate-800/80 p-6 space-y-4">
        <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-teal-400" />
          <span>Core Recovery Pacing Principles in this App</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed">
          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
            <p className="font-semibold text-teal-300">1. Energy Envelope Pacing</p>
            <p className="text-slate-400">
              Track daily steps, calories burned, and active intensity minutes to avoid exceeding your anaerobic threshold and triggering crashes.
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
            <p className="font-semibold text-teal-300">2. 24–48 Hour PEM Lag Tracking</p>
            <p className="text-slate-400">
              Post-Exertional Malaise symptoms typically manifest 12 to 48 hours after an exertion event. The correlation timeline visualizes this lag.
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
            <p className="font-semibold text-teal-300">3. Multi-Symptom Severity (0–10)</p>
            <p className="text-slate-400">
              Log Headache, Fatigue, Eye Stinging, General Malaise, and Brain Fog independently to identify individual symptom triggers.
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
            <p className="font-semibold text-teal-300">4. Private &amp; Offline First</p>
            <p className="text-slate-400">
              Your health data is stored in client-side SQLite3 with IndexedDB caching and synced directly to your personal pCloud drive.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Hello World Dashboard Widget
 */
const HelloWorldWidget: React.FC<{ context: PluginContext }> = ({ context }) => {
  return (
    <div className="rounded-xl bg-gradient-to-r from-slate-900 to-teal-950/40 border border-teal-500/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
          <Globe className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-white">Hello World Plugin Active</h4>
            <span className="text-[10px] font-mono text-teal-400 bg-teal-500/10 px-1.5 py-0.5 rounded">AUTO-LOADED</span>
          </div>
          <p className="text-xs text-slate-400">
            Plugin architecture initialized at startup. Main SQLite3 database connected and thread-safe.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => {
            context.showNotification(
              'Hello World!',
              'Welcome to your PEM Tracker chronic illness recovery application.',
              'success'
            );
          }}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-600/80 hover:bg-teal-600 text-white transition-colors"
        >
          Send Greeting
        </button>
        <button
          onClick={() => context.navigateTo('hello-world')}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors border border-slate-700"
        >
          Details
        </button>
      </div>
    </div>
  );
};

export const helloWorldPlugin: Plugin = {
  metadata: {
    id: 'hello-world',
    name: 'Hello World Plugin',
    version: '1.0.0',
    author: 'PEM Tracker Team',
    description: 'Displays a welcome greeting on application launch and demonstrates dynamic menu and navbar extensibility.',
    icon: 'Globe',
  },
  initialize(context: PluginContext) {
    // 1. Show Hello World message on first launch
    const hasSeen = localStorage.getItem(STORAGE_KEY_SEEN);
    if (!hasSeen) {
      setTimeout(() => {
        context.showNotification(
          'Hello World!',
          'Welcome to PEM Tracker! The dynamic plugin architecture and SQLite3 database have been initialized.',
          'info'
        );
        localStorage.setItem(STORAGE_KEY_SEEN, 'true');
      }, 500);
    }

    // 2. Register Navigation Bar Item
    context.registerNavItem({
      id: 'hello-world',
      label: 'Hello World',
      icon: 'Globe',
      viewId: 'hello-world',
      order: 30,
    });

    // 3. Register Main Menu Item
    context.registerMenuItem({
      id: 'menu-hello-world',
      label: 'Hello World Welcome & Tour',
      icon: 'Globe',
      action: () => context.navigateTo('hello-world'),
      order: 30,
    });

    // 4. Register View Page
    context.registerView({
      id: 'hello-world',
      title: 'Hello World Plugin',
      component: HelloWorldView,
    });

    // 5. Register Dashboard Widget
    context.registerDashboardWidget({
      id: 'widget-hello-world',
      title: 'Hello World & Plugin System',
      component: HelloWorldWidget,
      span: 3,
      order: 1,
    });
  },
};

export default helloWorldPlugin;
