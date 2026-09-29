/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Plugin, PluginContext } from '../plugin.types';
import { Globe, Sparkles, CheckCircle2, Database, Layers, ArrowRight, ShieldCheck } from 'lucide-react';

/**
 * Hello World Plugin Component (Light Theme, Accessible from Menu)
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
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-50 via-white to-slate-50 border border-teal-200 p-6 sm:p-8 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-700">
              <Sparkles className="w-4 h-4 text-teal-600" />
              <span>Plugin System Online</span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500 font-mono">v1.0.0</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Hello World! Welcome to PEM Tracker
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-2xl leading-relaxed">
              Your personalized pacing and energy expenditure companion for chronic illness recovery.
              The application discovers and initializes plug-ins dynamically, maintains an in-browser
              thread-safe SQLite3 database, and provides secure pCloud implicit grant storage.
            </p>
          </div>
          <div className="hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-teal-100 border border-teal-200 text-teal-700">
            <Globe className="w-7 h-7" />
          </div>
        </div>

        <div className="mt-6 sm:mt-8 flex flex-wrap items-center gap-3">
          <button
            onClick={triggerToastGreeting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs sm:text-sm transition-colors shadow-sm"
          >
            <span>Trigger Hello World Toast</span>
            <Sparkles className="w-4 h-4" />
          </button>
          <button
            onClick={() => context.navigateTo('dashboard')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs sm:text-sm transition-colors border border-slate-200 shadow-sm"
          >
            <span>Go to Pacing Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => context.navigateTo('sql-console')}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs sm:text-sm transition-colors border border-slate-200 shadow-sm"
          >
            <span>Open SQL Query Console</span>
            <Database className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Plugin Architecture Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl bg-white border border-slate-200 p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Plugin Discovery</span>
            <Layers className="w-4 h-4 text-teal-600" />
          </div>
          <p className="text-base font-semibold text-slate-900">Dynamic Auto-Loader</p>
          <p className="text-xs text-slate-600 leading-normal">
            Scans <code className="text-teal-700 font-mono bg-teal-50 px-1 py-0.5 rounded">src/plugins/*/index.ts</code> at startup and registers nav links, menus, and routes.
          </p>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Storage Engine</span>
            <Database className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-base font-semibold text-slate-900">SQLite3 WASM Storage</p>
          <p className="text-xs text-slate-600 leading-normal">
            Thread-safe abstracted storage mutex. Currently storing{' '}
            <span className="text-emerald-700 font-mono font-semibold">{pemCount}</span> PEM logs and{' '}
            <span className="text-emerald-700 font-mono font-semibold">{actCount}</span> activities.
          </p>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cloud Storage Sync</span>
            <ShieldCheck className="w-4 h-4 text-sky-600" />
          </div>
          <p className="text-base font-semibold text-slate-900">pCloud Implicit Grant</p>
          <p className="text-xs text-slate-600 leading-normal">
            Client ID <code className="text-sky-700 font-mono bg-sky-50 px-1 py-0.5 rounded">cQmzJUo7RiJ</code> with hash fragment token extraction for private cloud storage.
          </p>
        </div>
      </div>

      {/* Chronic Illness Recovery Guidance */}
      <div className="rounded-xl bg-white border border-slate-200 p-6 space-y-4 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-teal-600" />
          <span>Core Recovery Pacing Principles in this App</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600 leading-relaxed">
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <p className="font-semibold text-slate-800">Energy Envelope Pacing</p>
            <p>
              Stay within 50–70% of perceived maximum capacity. Exceeding your daily energy envelope triggers cellular metabolic failure in ME/CFS and Long COVID.
            </p>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
            <p className="font-semibold text-slate-800">24–48h PEM Lag Correlation</p>
            <p>
              Crashes typically appear 1 to 2 days after the trigger. The built-in correlation analyzer links previous day exertion metrics with delayed symptoms.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * Hello World Plugin Definition
 * Cleaned: No longer shows banner or toast on initial site opening,
 * but remains fully registered and accessible under the App Menu!
 */
export const helloWorldPlugin: Plugin = {
  metadata: {
    id: 'hello-world',
    name: 'Hello World Plugin',
    version: '1.0.0',
    description: 'Demonstrates dynamic menu and navigation extensibility with a tour of the application architecture.',
    icon: 'Globe',
  },
  initialize(context: PluginContext) {
    // 1. Register Main Menu Item (Kept under menu as requested)
    context.registerMenuItem({
      id: 'menu-hello-world',
      label: 'Hello World Architecture Tour',
      icon: 'Globe',
      action: () => context.navigateTo('hello-world'),
      order: 40,
    });

    // 2. Register View Page (Rendered when clicked from Menu)
    context.registerView({
      id: 'hello-world',
      title: 'Hello World Plugin',
      component: HelloWorldView,
    });
  },
};

export default helloWorldPlugin;
