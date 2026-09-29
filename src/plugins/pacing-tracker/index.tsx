/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Plugin, PluginContext } from '../plugin.types';
import { PEMRecord, ActivityRecord } from '../../types/database.types';
import {
  Activity,
  HeartPulse,
  Flame,
  Footprints,
  Clock,
  AlertTriangle,
  Plus,
  Trash2,
  Calendar,
  Sparkles,
  TrendingUp,
  Brain,
  Eye,
  Shield,
  Filter,
} from 'lucide-react';

interface DaySummary {
  date: string;
  totalDuration: number;
  totalSteps: number;
  totalCalories: number;
  modMins: number;
  vigMins: number;
  peakMins: number;
  avgFatigue: number | null;
  avgBrainFog: number | null;
  avgMalaise: number | null;
  activitiesCount: number;
  pemCount: number;
}

const PacingDashboardView: React.FC<{ context: PluginContext }> = ({ context }) => {
  const [pems, setPems] = useState<PEMRecord[]>([]);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActivityModalOpen, setIsActivityModalOpen] = useState<boolean>(false);
  const [isPemModalOpen, setIsPemModalOpen] = useState<boolean>(false);

  // Filter tab
  const [activeTab, setActiveTab] = useState<'overview' | 'activities' | 'pems' | 'correlation'>('overview');

  // Form states for new Activity
  const [activityForm, setActivityForm] = useState({
    activity_date: new Date().toISOString().slice(0, 16),
    activity_name: '',
    duration: 30,
    start_steps: 1000,
    end_steps: 1800,
    start_calories: 1400,
    end_calories: 1550,
    start_moderate: 0,
    end_moderate: 10,
    start_vigorous: 0,
    end_vigorous: 0,
    start_peak: 0,
    end_peak: 0,
  });

  // Form states for new PEM
  const [pemForm, setPemForm] = useState({
    pem_date: new Date().toISOString().slice(0, 16),
    headache: 3,
    fatigue: 5,
    eye_stinging: 2,
    general_malaise: 4,
    brain_fog: 4,
  });

  const loadData = async () => {
    try {
      setIsLoading(true);
      const pemList = await context.database.getAllPEMs();
      const actList = await context.database.getAllActivities();
      setPems(pemList);
      setActivities(actList);
    } catch (err) {
      console.error('Failed to load pacing data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = context.database.addChangeListener(() => {
      loadData();
    });
    return unsub;
  }, [context]);

  // Compute daily summaries
  const daySummariesMap = new Map<string, DaySummary>();

  activities.forEach((act) => {
    const day = act.activity_date.slice(0, 10);
    const existing = daySummariesMap.get(day) || {
      date: day,
      totalDuration: 0,
      totalSteps: 0,
      totalCalories: 0,
      modMins: 0,
      vigMins: 0,
      peakMins: 0,
      avgFatigue: null,
      avgBrainFog: null,
      avgMalaise: null,
      activitiesCount: 0,
      pemCount: 0,
    };

    existing.totalDuration += Number(act.duration || 0);
    existing.totalSteps += Math.max(0, Number(act.end_steps || 0) - Number(act.start_steps || 0));
    existing.totalCalories += Math.max(0, Number(act.end_calories || 0) - Number(act.start_calories || 0));
    existing.modMins += Math.max(0, Number(act.end_moderate || 0) - Number(act.start_moderate || 0));
    existing.vigMins += Math.max(0, Number(act.end_vigorous || 0) - Number(act.start_vigorous || 0));
    existing.peakMins += Math.max(0, Number(act.end_peak || 0) - Number(act.start_peak || 0));
    existing.activitiesCount += 1;

    daySummariesMap.set(day, existing);
  });

  pems.forEach((p) => {
    const day = p.pem_date.slice(0, 10);
    const existing = daySummariesMap.get(day) || {
      date: day,
      totalDuration: 0,
      totalSteps: 0,
      totalCalories: 0,
      modMins: 0,
      vigMins: 0,
      peakMins: 0,
      avgFatigue: null,
      avgBrainFog: null,
      avgMalaise: null,
      activitiesCount: 0,
      pemCount: 0,
    };

    existing.pemCount += 1;
    existing.avgFatigue = (existing.avgFatigue === null ? p.fatigue : (existing.avgFatigue + p.fatigue) / 2);
    existing.avgBrainFog = (existing.avgBrainFog === null ? p.brain_fog : (existing.avgBrainFog + p.brain_fog) / 2);
    existing.avgMalaise = (existing.avgMalaise === null ? p.general_malaise : (existing.avgMalaise + p.general_malaise) / 2);

    daySummariesMap.set(day, existing);
  });

  const sortedDays = Array.from(daySummariesMap.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Today or latest metrics
  const latestSummary = sortedDays[0] || {
    totalDuration: 0,
    totalSteps: 0,
    totalCalories: 0,
    modMins: 0,
    vigMins: 0,
    peakMins: 0,
    avgFatigue: null,
    avgBrainFog: null,
    avgMalaise: null,
  };

  const handleSaveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await context.database.insertActivity({
        activity_date: activityForm.activity_date.replace('T', ' '),
        activity_name: activityForm.activity_name || 'Daily Movement',
        duration: Number(activityForm.duration),
        start_steps: Number(activityForm.start_steps),
        end_steps: Number(activityForm.end_steps),
        start_calories: Number(activityForm.start_calories),
        end_calories: Number(activityForm.end_calories),
        start_moderate: Number(activityForm.start_moderate),
        end_moderate: Number(activityForm.end_moderate),
        start_vigorous: Number(activityForm.start_vigorous),
        end_vigorous: Number(activityForm.end_vigorous),
        start_peak: Number(activityForm.start_peak),
        end_peak: Number(activityForm.end_peak),
      });
      setIsActivityModalOpen(false);
      context.showNotification(
        'Activity Recorded',
        `Logged "${activityForm.activity_name || 'Movement'}" with ${
          activityForm.end_steps - activityForm.start_steps
        } steps.`,
        'success'
      );
    } catch (err: any) {
      context.showNotification('Error', err.message || 'Failed to save activity', 'error');
    }
  };

  const handleSavePem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await context.database.insertPEM({
        pem_date: pemForm.pem_date.replace('T', ' '),
        headache: Number(pemForm.headache),
        fatigue: Number(pemForm.fatigue),
        eye_stinging: Number(pemForm.eye_stinging),
        general_malaise: Number(pemForm.general_malaise),
        brain_fog: Number(pemForm.brain_fog),
      });
      setIsPemModalOpen(false);
      context.showNotification(
        'PEM Episode Logged',
        `Recorded symptom severity (Fatigue: ${pemForm.fatigue}/10, Brain Fog: ${pemForm.brain_fog}/10).`,
        'success'
      );
    } catch (err: any) {
      context.showNotification('Error', err.message || 'Failed to save PEM episode', 'error');
    }
  };

  const handleDeleteActivity = async (id: number) => {
    if (confirm('Delete this activity entry?')) {
      await context.database.deleteActivity(id);
      context.showNotification('Deleted', 'Activity record removed', 'info');
    }
  };

  const handleDeletePem = async (id: number) => {
    if (confirm('Delete this PEM record?')) {
      await context.database.deletePEM(id);
      context.showNotification('Deleted', 'PEM record removed', 'info');
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-2">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-teal-400" />
            <span>Pacing &amp; Daily Energy Management</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Tracking energy envelope, intensity zones, and multi-symptom Post-Exertional Malaise for chronic illness recovery.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsActivityModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Activity / Energy</span>
          </button>
          <button
            onClick={() => setIsPemModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-teal-300 font-medium text-xs transition-colors border border-teal-500/30"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span>Log PEM Episode</span>
          </button>
        </div>
      </div>

      {/* Primary Metric Envelopes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Daily Active Steps</span>
            <Footprints className="w-4 h-4 text-teal-400" />
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">
            {latestSummary.totalSteps.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-400">
            {latestSummary.totalSteps > 3000 ? (
              <span className="text-amber-400">Above gentle pacing limit</span>
            ) : (
              <span className="text-teal-400">Within safe energy budget</span>
            )}
          </p>
        </div>

        <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Active Expenditure</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">
            {Math.round(latestSummary.totalCalories)} <span className="text-sm font-normal text-slate-400">kcal</span>
          </p>
          <p className="text-[11px] text-slate-400">
            Duration: <span className="tabular-nums font-mono text-slate-300">{latestSummary.totalDuration}m</span>
          </p>
        </div>

        <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Anaerobic / Peak Risk</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">
            {latestSummary.vigMins + latestSummary.peakMins}{' '}
            <span className="text-sm font-normal text-slate-400">mins</span>
          </p>
          <p className="text-[11px] text-slate-400">
            {latestSummary.vigMins + latestSummary.peakMins > 0 ? (
              <span className="text-rose-400 font-medium">Risk of PEM crash trigger</span>
            ) : (
              <span className="text-teal-400 font-medium">No anaerobic spikes</span>
            )}
          </p>
        </div>

        <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Current Fatigue</span>
            <Brain className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">
            {latestSummary.avgFatigue !== null ? (
              `${latestSummary.avgFatigue.toFixed(1)}/10`
            ) : (
              <span className="text-slate-500 text-base">No log</span>
            )}
          </p>
          <p className="text-[11px] text-slate-400">
            Malaise: {latestSummary.avgMalaise !== null ? `${latestSummary.avgMalaise.toFixed(1)}/10` : '—'}
          </p>
        </div>
      </div>

      {/* Tabs navigation */}
      <div className="flex items-center gap-1 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'overview'
              ? 'bg-teal-500/10 text-teal-400 border border-teal-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Daily Overview &amp; Timeline
        </button>
        <button
          onClick={() => setActiveTab('activities')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'activities'
              ? 'bg-teal-500/10 text-teal-400 border border-teal-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Activity Ledger ({activities.length})
        </button>
        <button
          onClick={() => setActiveTab('pems')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'pems'
              ? 'bg-teal-500/10 text-teal-400 border border-teal-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          PEM Symptom Logs ({pems.length})
        </button>
        <button
          onClick={() => setActiveTab('correlation')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            activeTab === 'correlation'
              ? 'bg-teal-500/10 text-teal-400 border border-teal-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Lag &amp; Crash Analyzer
        </button>
      </div>

      {/* Tab 1: Overview & Timeline */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center justify-between">
              <span>Daily Pacing Envelope History</span>
              <span className="text-xs text-slate-500 font-normal">Recent Days</span>
            </h3>

            <div className="space-y-3">
              {sortedDays.map((day) => (
                <div
                  key={day.date}
                  className="rounded-lg bg-slate-950/70 border border-slate-800/80 p-3.5 space-y-2.5 hover:border-slate-700 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white font-mono">{day.date}</span>
                      <span className="text-slate-500">·</span>
                      <span className="text-slate-400">
                        {day.activitiesCount} {day.activitiesCount === 1 ? 'activity' : 'activities'}
                      </span>
                      {day.pemCount > 0 && (
                        <span className="text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded text-[10px]">
                          {day.pemCount} PEM log{day.pemCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 font-mono text-[11px] text-slate-300">
                      <span>
                        Steps: <strong className="text-teal-400 tabular-nums">{day.totalSteps.toLocaleString()}</strong>
                      </span>
                      <span>
                        Burn: <strong className="text-amber-400 tabular-nums">{Math.round(day.totalCalories)}</strong> kcal
                      </span>
                      <span>
                        Active: <strong className="text-slate-200 tabular-nums">{day.totalDuration}</strong>m
                      </span>
                    </div>
                  </div>

                  {/* Visual Energy Bar */}
                  <div className="space-y-1">
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                      <div
                        className="bg-teal-500 transition-all"
                        style={{ width: `${Math.min(100, (day.totalSteps / 4000) * 70)}%` }}
                        title="Steps progress vs safe threshold"
                      />
                      {day.modMins > 0 && (
                        <div
                          className="bg-amber-500 transition-all"
                          style={{ width: `${Math.min(20, day.modMins * 1.5)}%` }}
                          title="Moderate Intensity Minutes"
                        />
                      )}
                      {(day.vigMins + day.peakMins) > 0 && (
                        <div
                          className="bg-rose-500 transition-all"
                          style={{ width: `${Math.min(30, (day.vigMins + day.peakMins) * 3)}%` }}
                          title="Vigorous/Peak Anaerobic Minutes (Crash Trigger)"
                        />
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>Rest / Gentle</span>
                      <span>Pacing Limit: ~3,000 steps</span>
                      <span>Crash Risk Zone</span>
                    </div>
                  </div>

                  {/* Symptoms recorded on this day */}
                  {(day.avgFatigue !== null || day.avgBrainFog !== null || day.avgMalaise !== null) && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/40 text-[11px]">
                      <span className="text-slate-400">Symptoms:</span>
                      {day.avgFatigue !== null && (
                        <span className="text-slate-300">
                          Fatigue: <strong className="text-amber-300 font-mono">{day.avgFatigue.toFixed(1)}/10</strong>
                        </span>
                      )}
                      {day.avgBrainFog !== null && (
                        <span className="text-slate-300">
                          Brain Fog: <strong className="text-indigo-300 font-mono">{day.avgBrainFog.toFixed(1)}/10</strong>
                        </span>
                      )}
                      {day.avgMalaise !== null && (
                        <span className="text-slate-300">
                          Malaise: <strong className="text-rose-300 font-mono">{day.avgMalaise.toFixed(1)}/10</strong>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Activity Ledger */}
      {activeTab === 'activities' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">
              Activity &amp; Energy Records (<span className="font-mono text-teal-400">{activities.length}</span>)
            </h3>
            <button
              onClick={() => setIsActivityModalOpen(true)}
              className="px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded-lg flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Entry</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950/80 text-slate-400 uppercase font-mono tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Date &amp; Time</th>
                  <th className="py-2.5 px-3">Activity</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3">Delta Steps</th>
                  <th className="py-2.5 px-3">Delta Calories</th>
                  <th className="py-2.5 px-3">Intensity Zones (Mod/Vig/Peak)</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 font-mono">
                {activities.map((act) => {
                  const deltaSteps = Math.max(0, act.end_steps - act.start_steps);
                  const deltaCals = Math.max(0, act.end_calories - act.start_calories);
                  const modMins = Math.max(0, act.end_moderate - act.start_moderate);
                  const vigMins = Math.max(0, act.end_vigorous - act.start_vigorous);
                  const peakMins = Math.max(0, act.end_peak - act.start_peak);

                  return (
                    <tr key={act.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap text-[11px]">
                        {act.activity_date}
                      </td>
                      <td className="py-2.5 px-3 text-white font-sans font-medium">
                        {act.activity_name}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 tabular-nums">
                        {act.duration}m
                      </td>
                      <td className="py-2.5 px-3 text-teal-400 tabular-nums">
                        +{deltaSteps.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-amber-400 tabular-nums">
                        +{Math.round(deltaCals)} kcal
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 tabular-nums text-[11px]">
                        <span className="text-amber-300">{modMins}m mod</span> /{' '}
                        <span className="text-rose-400">{vigMins}m vig</span> /{' '}
                        <span className="text-purple-400">{peakMins}m peak</span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleDeleteActivity(act.id)}
                          className="p-1 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition-colors"
                          title="Delete record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: PEM Symptom Logs */}
      {activeTab === 'pems' && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-200">
              PEM (Post-Exertional Malaise) Symptom Logs (<span className="font-mono text-rose-400">{pems.length}</span>)
            </h3>
            <button
              onClick={() => setIsPemModalOpen(true)}
              className="px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-500 text-white rounded-lg flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log PEM Episode</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950/80 text-slate-400 uppercase font-mono tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Headache</th>
                  <th className="py-2.5 px-3">Fatigue</th>
                  <th className="py-2.5 px-3">Eye Stinging</th>
                  <th className="py-2.5 px-3">General Malaise</th>
                  <th className="py-2.5 px-3">Brain Fog</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 font-mono">
                {pems.map((pem) => {
                  const getSeverityColor = (val: number) => {
                    if (val >= 7) return 'text-rose-400 font-bold';
                    if (val >= 4) return 'text-amber-400 font-medium';
                    return 'text-teal-400';
                  };

                  return (
                    <tr key={pem.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap text-[11px]">
                        {pem.pem_date}
                      </td>
                      <td className={`py-2.5 px-3 tabular-nums ${getSeverityColor(pem.headache)}`}>
                        {pem.headache}/10
                      </td>
                      <td className={`py-2.5 px-3 tabular-nums ${getSeverityColor(pem.fatigue)}`}>
                        {pem.fatigue}/10
                      </td>
                      <td className={`py-2.5 px-3 tabular-nums ${getSeverityColor(pem.eye_stinging)}`}>
                        {pem.eye_stinging}/10
                      </td>
                      <td className={`py-2.5 px-3 tabular-nums ${getSeverityColor(pem.general_malaise)}`}>
                        {pem.general_malaise}/10
                      </td>
                      <td className={`py-2.5 px-3 tabular-nums ${getSeverityColor(pem.brain_fog)}`}>
                        {pem.brain_fog}/10
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => handleDeletePem(pem.id)}
                          className="p-1 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition-colors"
                          title="Delete record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Lag & Crash Analyzer */}
      {activeTab === 'correlation' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-6 h-6 text-teal-400" />
              <div>
                <h3 className="text-base font-semibold text-white">Post-Exertional Malaise Lag Correlation</h3>
                <p className="text-xs text-slate-400">
                  PEM is characteristically delayed by 12 to 48 hours following physical or cognitive overexertion.
                  Comparing high activity days with the following day&apos;s malaise severity:
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {sortedDays.map((day, idx) => {
                const prevDay = sortedDays[idx + 1];
                if (!prevDay) return null;

                const isCrashDay = (day.avgFatigue || 0) >= 7 || (day.avgMalaise || 0) >= 7;
                const wasOverexertedDayBefore = prevDay.totalSteps > 2500 || (prevDay.vigMins + prevDay.peakMins) > 10;

                return (
                  <div
                    key={day.date}
                    className={`rounded-lg p-4 border transition-colors ${
                      isCrashDay && wasOverexertedDayBefore
                        ? 'bg-rose-950/30 border-rose-800/60'
                        : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-xs">{day.date}</span>
                          {isCrashDay && wasOverexertedDayBefore && (
                            <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">
                              EXERTION-INDUCED CRASH DETECTED
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-300">
                          Symptom Fatigue: <strong className="text-amber-400">{day.avgFatigue?.toFixed(1) || '0'}/10</strong> · Malaise: <strong className="text-rose-400">{day.avgMalaise?.toFixed(1) || '0'}/10</strong>
                        </p>
                      </div>

                      <div className="text-left sm:text-right text-xs text-slate-400 font-mono">
                        <p>Preceding Day ({prevDay.date}):</p>
                        <p className="text-slate-300">
                          Steps: <strong className="text-teal-400">{prevDay.totalSteps}</strong> · Anaerobic:{' '}
                          <strong className="text-rose-400">{prevDay.vigMins + prevDay.peakMins}m</strong>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Activity Modal */}
      {isActivityModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-teal-400" />
                <span>Log Daily Activity &amp; Energy</span>
              </h3>
              <button
                onClick={() => setIsActivityModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSaveActivity} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Activity Name</label>
                <input
                  type="text"
                  required
                  value={activityForm.activity_name}
                  onChange={(e) => setActivityForm({ ...activityForm, activity_name: e.target.value })}
                  placeholder="e.g. Gentle walk, Meal prep, Doctor visit, Reading"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Timestamp</label>
                  <input
                    type="datetime-local"
                    required
                    value={activityForm.activity_date}
                    onChange={(e) => setActivityForm({ ...activityForm, activity_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:border-teal-500 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Duration (minutes)</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={activityForm.duration}
                    onChange={(e) => setActivityForm({ ...activityForm, duration: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:border-teal-500 font-mono"
                  />
                </div>
              </div>

              {/* Steps */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-teal-400">Step Counts (start_steps / end_steps)</span>
                  <span className="font-mono text-teal-300">
                    Delta: +{Math.max(0, activityForm.end_steps - activityForm.start_steps)} steps
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-400">Start Steps</span>
                    <input
                      type="number"
                      value={activityForm.start_steps}
                      onChange={(e) => setActivityForm({ ...activityForm, start_steps: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-mono mt-1"
                    />
                  </div>
                  <div>
                    <span className="text-slate-400">End Steps</span>
                    <input
                      type="number"
                      value={activityForm.end_steps}
                      onChange={(e) => setActivityForm({ ...activityForm, end_steps: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-mono mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Calories */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-400">Calories (start_calories / end_calories)</span>
                  <span className="font-mono text-amber-300">
                    Delta: +{Math.max(0, activityForm.end_calories - activityForm.start_calories)} kcal
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-400">Start Calories</span>
                    <input
                      type="number"
                      value={activityForm.start_calories}
                      onChange={(e) => setActivityForm({ ...activityForm, start_calories: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-mono mt-1"
                    />
                  </div>
                  <div>
                    <span className="text-slate-400">End Calories</span>
                    <input
                      type="number"
                      value={activityForm.end_calories}
                      onChange={(e) => setActivityForm({ ...activityForm, end_calories: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-white font-mono mt-1"
                    />
                  </div>
                </div>
              </div>

              {/* Pacing Intensity Zones */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-3">
                <span className="font-semibold text-slate-300 block">
                  Pacing Intensity Zones (Minutes Tracker)
                </span>
                
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-amber-400">Moderate (Start/End)</span>
                    <div className="flex gap-1 mt-1">
                      <input
                        type="number"
                        placeholder="Start"
                        value={activityForm.start_moderate}
                        onChange={(e) => setActivityForm({ ...activityForm, start_moderate: Number(e.target.value) })}
                        className="w-1/2 bg-slate-900 border border-slate-800 rounded p-1.5 text-white font-mono text-[11px]"
                      />
                      <input
                        type="number"
                        placeholder="End"
                        value={activityForm.end_moderate}
                        onChange={(e) => setActivityForm({ ...activityForm, end_moderate: Number(e.target.value) })}
                        className="w-1/2 bg-slate-900 border border-slate-800 rounded p-1.5 text-white font-mono text-[11px]"
                      />
                    </div>
                  </div>

                  <div>
                    <span className="text-rose-400">Vigorous (Start/End)</span>
                    <div className="flex gap-1 mt-1">
                      <input
                        type="number"
                        placeholder="Start"
                        value={activityForm.start_vigorous}
                        onChange={(e) => setActivityForm({ ...activityForm, start_vigorous: Number(e.target.value) })}
                        className="w-1/2 bg-slate-900 border border-slate-800 rounded p-1.5 text-white font-mono text-[11px]"
                      />
                      <input
                        type="number"
                        placeholder="End"
                        value={activityForm.end_vigorous}
                        onChange={(e) => setActivityForm({ ...activityForm, end_vigorous: Number(e.target.value) })}
                        className="w-1/2 bg-slate-900 border border-slate-800 rounded p-1.5 text-white font-mono text-[11px]"
                      />
                    </div>
                  </div>

                  <div>
                    <span className="text-purple-400">Peak (Start/End)</span>
                    <div className="flex gap-1 mt-1">
                      <input
                        type="number"
                        placeholder="Start"
                        value={activityForm.start_peak}
                        onChange={(e) => setActivityForm({ ...activityForm, start_peak: Number(e.target.value) })}
                        className="w-1/2 bg-slate-900 border border-slate-800 rounded p-1.5 text-white font-mono text-[11px]"
                      />
                      <input
                        type="number"
                        placeholder="End"
                        value={activityForm.end_peak}
                        onChange={(e) => setActivityForm({ ...activityForm, end_peak: Number(e.target.value) })}
                        className="w-1/2 bg-slate-900 border border-slate-800 rounded p-1.5 text-white font-mono text-[11px]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition-colors shadow-sm"
                >
                  Save Activity Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PEM Modal */}
      {isPemModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <span>Log PEM (Post-Exertional Malaise) Episode</span>
              </h3>
              <button
                onClick={() => setIsPemModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSavePem} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-medium">Timestamp</label>
                <input
                  type="datetime-local"
                  required
                  value={pemForm.pem_date}
                  onChange={(e) => setPemForm({ ...pemForm, pem_date: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>

              {/* Sliders for each symptom */}
              {[
                { key: 'fatigue', label: 'Fatigue Severity', icon: HeartPulse, color: 'text-rose-400' },
                { key: 'general_malaise', label: 'General Malaise (Flu-like feeling)', icon: Shield, color: 'text-amber-400' },
                { key: 'brain_fog', label: 'Brain Fog / Cognitive Dysfunction', icon: Brain, color: 'text-indigo-400' },
                { key: 'headache', label: 'Headache Intensity', icon: Activity, color: 'text-teal-400' },
                { key: 'eye_stinging', label: 'Eye Stinging / Sensory Overload', icon: Eye, color: 'text-sky-400' },
              ].map((sym) => {
                const currentVal = (pemForm as any)[sym.key];
                return (
                  <div key={sym.key} className="space-y-1.5 p-3 rounded-lg bg-slate-950/50 border border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold flex items-center gap-1.5 ${sym.color}`}>
                        <sym.icon className="w-3.5 h-3.5" />
                        <span>{sym.label}</span>
                      </span>
                      <span className="font-mono tabular-nums text-white font-bold text-sm">
                        {currentVal} / 10
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      step="0.5"
                      value={currentVal}
                      onChange={(e) => setPemForm({ ...pemForm, [sym.key]: Number(e.target.value) })}
                      className="w-full accent-teal-500 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>0 (None)</span>
                      <span>5 (Moderate)</span>
                      <span>10 (Severe Crash)</span>
                    </div>
                  </div>
                );
              })}

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition-colors shadow-sm"
                >
                  Save PEM Record to SQLite
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const pacingTrackerPlugin: Plugin = {
  metadata: {
    id: 'pacing-tracker',
    name: 'PEM Pacing & Energy Tracker',
    version: '1.0.0',
    author: 'PEM Tracker Team',
    description: 'Core pacing companion: daily energy expenditure tracking, intensity zones, and multi-symptom PEM crash analyzer.',
    icon: 'HeartPulse',
  },
  initialize(context: PluginContext) {
    // 1. Register Nav Item as primary dashboard
    context.registerNavItem({
      id: 'dashboard',
      label: 'Pacing Dashboard',
      icon: 'HeartPulse',
      viewId: 'dashboard',
      order: 10,
    });

    // 2. Register Menu Items
    context.registerMenuItem({
      id: 'menu-pacing',
      label: 'Pacing & Energy Envelope Dashboard',
      icon: 'HeartPulse',
      action: () => context.navigateTo('dashboard'),
      order: 10,
    });

    // 3. Register View
    context.registerView({
      id: 'dashboard',
      title: 'PEM Pacing & Energy Tracker',
      component: PacingDashboardView,
    });
  },
};

export default pacingTrackerPlugin;
