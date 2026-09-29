/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Plugin, PluginContext } from '../plugin.types';
import { ActivityRecord, PEMRecord } from '../../types/database.types';
import {
  HeartPulse,
  Activity,
  AlertTriangle,
  Calendar,
  Flame,
  Footprints,
  Clock,
  Sparkles,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Brain,
  Zap,
  ShieldAlert,
  Sliders,
  CheckCircle2,
  X,
  ChevronRight,
  Info,
} from 'lucide-react';

export const PacingTrackerView: React.FC<{ context: PluginContext }> = ({ context }) => {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [pems, setPems] = useState<PEMRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal controls
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isPemModalOpen, setIsPemModalOpen] = useState(false);

  // Form states
  const [activityForm, setActivityForm] = useState({
    activity_date: new Date().toISOString().substring(0, 16),
    activity_name: '',
    duration: 15,
    start_steps: 0,
    end_steps: 500,
    start_calories: 0,
    end_calories: 60,
    start_moderate: 0,
    end_moderate: 10,
    start_vigorous: 0,
    end_vigorous: 0,
    start_peak: 0,
    end_peak: 0,
  });

  const [pemForm, setPemForm] = useState({
    pem_date: new Date().toISOString().substring(0, 16),
    headache: 3,
    fatigue: 5,
    eye_stinging: 2,
    general_malaise: 4,
    brain_fog: 3,
  });

  const loadData = async () => {
    try {
      const [acts, pemList] = await Promise.all([
        context.database.getAllActivities(),
        context.database.getAllPEMs(),
      ]);
      setActivities(acts);
      setPems(pemList);
    } catch (err) {
      console.error('Error loading pacing data:', err);
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

  // Daily summary rollups
  const dailyRollups = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        totalSteps: number;
        totalCalories: number;
        totalDuration: number;
        modMins: number;
        vigMins: number;
        peakMins: number;
        activitiesCount: number;
      }
    >();

    activities.forEach((act) => {
      const day = act.activity_date.substring(0, 10);
      const deltaSteps = Math.max(0, act.end_steps - act.start_steps);
      const deltaCals = Math.max(0, act.end_calories - act.start_calories);
      const mod = Math.max(0, act.end_moderate - act.start_moderate);
      const vig = Math.max(0, act.end_vigorous - act.start_vigorous);
      const peak = Math.max(0, act.end_peak - act.start_peak);

      const existing = map.get(day) || {
        date: day,
        totalSteps: 0,
        totalCalories: 0,
        totalDuration: 0,
        modMins: 0,
        vigMins: 0,
        peakMins: 0,
        activitiesCount: 0,
      };

      existing.totalSteps += deltaSteps;
      existing.totalCalories += deltaCals;
      existing.totalDuration += act.duration;
      existing.modMins += mod;
      existing.vigMins += vig;
      existing.peakMins += peak;
      existing.activitiesCount += 1;

      map.set(day, existing);
    });

    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [activities]);

  // PEM symptom rollups by date
  const pemRollups = useMemo(() => {
    const map = new Map<
      string,
      {
        date: string;
        avgFatigue: number;
        avgMalaise: number;
        avgBrainFog: number;
        avgHeadache: number;
        count: number;
      }
    >();

    pems.forEach((p) => {
      const day = p.pem_date.substring(0, 10);
      const existing = map.get(day) || {
        date: day,
        avgFatigue: 0,
        avgMalaise: 0,
        avgBrainFog: 0,
        avgHeadache: 0,
        count: 0,
      };

      existing.avgFatigue += p.fatigue;
      existing.avgMalaise += p.general_malaise;
      existing.avgBrainFog += p.brain_fog;
      existing.avgHeadache += p.headache;
      existing.count += 1;

      map.set(day, existing);
    });

    return Array.from(map.values()).map((p) => ({
      date: p.date,
      avgFatigue: p.avgFatigue / p.count,
      avgMalaise: p.avgMalaise / p.count,
      avgBrainFog: p.avgBrainFog / p.count,
      avgHeadache: p.avgHeadache / p.count,
      count: p.count,
    }));
  }, [pems]);

  // 24h - 48h PEM Lag Analysis: Correlate day N exertion with day N+1 and N+2 symptoms
  const lagCorrelation = useMemo(() => {
    return dailyRollups.slice(0, 7).map((dayAct) => {
      const dayDate = new Date(dayAct.date);
      const nextDayStr = new Date(dayDate.getTime() + 86400000).toISOString().substring(0, 10);
      const twoDaysStr = new Date(dayDate.getTime() + 172800000).toISOString().substring(0, 10);

      const nextDayPem = pemRollups.find((p) => p.date === nextDayStr);
      const twoDayPem = pemRollups.find((p) => p.date === twoDaysStr);

      const maxLagFatigue = Math.max(
        nextDayPem ? nextDayPem.avgFatigue : 0,
        twoDayPem ? twoDayPem.avgFatigue : 0
      );

      return {
        ...dayAct,
        nextDayStr,
        twoDaysStr,
        nextDayPem,
        twoDayPem,
        maxLagFatigue,
        isExertionRisk: dayAct.totalSteps > 3000 || dayAct.peakMins > 0 || dayAct.vigMins > 5,
        isCrashObserved: maxLagFatigue >= 6.0,
      };
    });
  }, [dailyRollups, pemRollups]);

  // Today's or latest snapshot metrics
  const latestSummary = useMemo(() => {
    if (dailyRollups.length === 0) {
      return {
        totalSteps: 0,
        totalCalories: 0,
        totalDuration: 0,
        modMins: 0,
        vigMins: 0,
        peakMins: 0,
        avgFatigue: null,
      };
    }
    const today = dailyRollups[0];
    const latestPem = pemRollups.find((p) => p.date === today.date);
    return {
      ...today,
      avgFatigue: latestPem ? latestPem.avgFatigue : null,
    };
  }, [dailyRollups, pemRollups]);

  const handleSaveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await context.database.insertActivity({
        activity_date: activityForm.activity_date.replace('T', ' '),
        activity_name: activityForm.activity_name.trim() || 'General Paced Activity',
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
        'Activity Saved',
        `Logged "${activityForm.activity_name || 'Activity'}" (+${
          activityForm.end_steps - activityForm.start_steps
        } steps).`,
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <HeartPulse className="w-5 h-5 text-teal-600" />
            <span>Pacing &amp; Daily Energy Management</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Tracking energy envelope, intensity zones, and multi-symptom Post-Exertional Malaise for chronic illness recovery.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsActivityModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs transition-colors shadow-sm min-h-[42px]"
          >
            <Plus className="w-4 h-4" />
            <span>Log Activity / Energy</span>
          </button>
          <button
            onClick={() => setIsPemModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-white hover:bg-slate-50 text-slate-800 font-medium text-xs transition-colors border border-slate-200 shadow-sm min-h-[42px]"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Log PEM Episode</span>
          </button>
        </div>
      </div>

      {/* Primary Metric Envelopes (Light Theme Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Daily Active Steps</span>
            <Footprints className="w-4 h-4 text-teal-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {latestSummary.totalSteps.toLocaleString()}
          </p>
          <p className="text-[11px]">
            {latestSummary.totalSteps > 3000 ? (
              <span className="text-amber-700 font-medium">Above gentle limit</span>
            ) : (
              <span className="text-teal-700 font-medium">Within safe budget</span>
            )}
          </p>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Active Expenditure</span>
            <Flame className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {Math.round(latestSummary.totalCalories)} <span className="text-sm font-normal text-slate-500">kcal</span>
          </p>
          <p className="text-[11px] text-slate-500">
            Duration: <span className="tabular-nums font-mono text-slate-800 font-medium">{latestSummary.totalDuration}m</span>
          </p>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Anaerobic / Peak</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {latestSummary.vigMins + latestSummary.peakMins}{' '}
            <span className="text-sm font-normal text-slate-500">mins</span>
          </p>
          <p className="text-[11px]">
            {latestSummary.vigMins + latestSummary.peakMins > 0 ? (
              <span className="text-rose-700 font-medium">Risk of PEM crash</span>
            ) : (
              <span className="text-teal-700 font-medium">No anaerobic spikes</span>
            )}
          </p>
        </div>

        <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-1 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Current Fatigue</span>
            <Brain className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 tabular-nums">
            {latestSummary.avgFatigue !== null ? (
              `${latestSummary.avgFatigue.toFixed(1)}/10`
            ) : (
              <span className="text-sm text-slate-400 font-normal">Not logged</span>
            )}
          </p>
          <p className="text-[11px] text-slate-500">
            {latestSummary.avgFatigue !== null && latestSummary.avgFatigue >= 7 ? (
              <span className="text-rose-700 font-medium">High crash severity</span>
            ) : (
              <span>Baseline fatigue</span>
            )}
          </p>
        </div>
      </div>

      {/* Safe Energy Envelope Pacing Gauge */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-slate-900">Safe Daily Energy Envelope Gauge</h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Safe Cap: <strong className="text-slate-800 font-mono">3,000 steps</strong></span>
            <span>·</span>
            <span>Anaerobic Threshold: <strong className="text-rose-700 font-mono">0 mins</strong></span>
          </div>
        </div>

        {/* Progress Bar Container */}
        <div>
          <div className="flex justify-between text-[11px] text-slate-500 mb-1.5 font-medium">
            <span>Current Utilization ({Math.min(100, Math.round((latestSummary.totalSteps / 3000) * 100))}%)</span>
            <span>{latestSummary.totalSteps} / 3000 steps</span>
          </div>
          <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden p-0.5 border border-slate-200">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                latestSummary.totalSteps > 3000
                  ? 'bg-rose-500'
                  : latestSummary.totalSteps > 2000
                  ? 'bg-amber-500'
                  : 'bg-teal-600'
              }`}
              style={{ width: `${Math.min(100, Math.max(5, (latestSummary.totalSteps / 3000) * 100))}%` }}
            />
          </div>
        </div>

        <div className="p-3 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-900 leading-relaxed flex items-start gap-2.5">
          <Info className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
          <p>
            <strong>Chronic Illness Recovery Rule:</strong> In Myalgic Encephalomyelitis (ME/CFS) and Long COVID, exceeding your anaerobic threshold triggers systemic mitochondrial exhaustion. Stay under 3,000 steps and 0 peak minutes to preserve functional energy reserves.
          </p>
        </div>
      </div>

      {/* 24h - 48h PEM Lag Correlation Matrix */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <h3 className="text-sm font-semibold text-slate-900">
              24–48 Hour PEM Lag Correlation Engine
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Linking Day N Exertion with Subsequent Crashes on Day N+1 and Day N+2
          </span>
        </div>

        {lagCorrelation.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-400">
            No activity records yet. Add daily activities to analyze delayed crash patterns.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {lagCorrelation.map((item, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-xl border text-xs space-y-2.5 transition-all ${
                  item.isCrashObserved
                    ? 'bg-rose-50/60 border-rose-200'
                    : item.isExertionRisk
                    ? 'bg-amber-50/60 border-amber-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between font-semibold">
                  <span className="text-slate-900 flex items-center gap-1.5 font-mono">
                    <Calendar className="w-3.5 h-3.5 text-teal-600" />
                    {item.date}
                  </span>
                  {item.isCrashObserved ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-100 text-rose-800 font-bold border border-rose-200">
                      Delayed Crash
                    </span>
                  ) : item.isExertionRisk ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-800 font-medium border border-amber-200">
                      Exertion Warning
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-teal-100 text-teal-800 font-medium border border-teal-200">
                      Safe Pacing
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200/80">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Steps Taken</span>
                    <strong className="text-slate-900 font-mono text-xs">{item.totalSteps.toLocaleString()}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Active Calories</span>
                    <strong className="text-slate-900 font-mono text-xs">{Math.round(item.totalCalories)} kcal</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Moderate Intensity</span>
                    <span className="text-slate-800 font-mono">{item.modMins}m</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Vigorous / Peak</span>
                    <span className={`font-mono ${item.vigMins + item.peakMins > 0 ? 'text-rose-700 font-bold' : 'text-slate-800'}`}>
                      {item.vigMins + item.peakMins}m
                    </span>
                  </div>
                </div>

                {/* Lag Outcome */}
                <div className="pt-1 text-[11px] space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Day +1 Fatigue ({item.nextDayStr}):</span>
                    <span className="font-mono font-medium text-slate-900">
                      {item.nextDayPem ? `${item.nextDayPem.avgFatigue.toFixed(1)}/10` : 'None'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Day +2 Fatigue ({item.twoDaysStr}):</span>
                    <span className="font-mono font-medium text-slate-900">
                      {item.twoDayPem ? `${item.twoDayPem.avgFatigue.toFixed(1)}/10` : 'None'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activities & PEM Log Tables Side-by-Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activities Table */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal-600" />
              <span>Recent Activities ({activities.length})</span>
            </h3>
            <button
              onClick={() => setIsActivityModalOpen(true)}
              className="text-xs text-teal-700 hover:text-teal-900 font-medium flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </button>
          </div>

          <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-50 text-slate-700 border-b border-slate-200 z-10 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Activity</th>
                  <th className="py-2.5 px-3 text-right">Δ Steps</th>
                  <th className="py-2.5 px-3 text-right">Δ Cals</th>
                  <th className="py-2.5 px-3 text-center">Peak</th>
                  <th className="py-2.5 px-2 text-center w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {activities.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                      No activities logged yet.
                    </td>
                  </tr>
                ) : (
                  activities.map((act) => {
                    const deltaSteps = act.end_steps - act.start_steps;
                    const deltaCals = act.end_calories - act.start_calories;
                    const peak = act.end_peak - act.start_peak;

                    return (
                      <tr key={act.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                          {act.activity_date.substring(5, 16)}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-900 whitespace-nowrap">
                          {act.activity_name}
                          <span className="text-[10px] text-slate-400 block font-normal">{act.duration} mins</span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-medium text-slate-900 whitespace-nowrap">
                          +{deltaSteps.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
                          +{deltaCals}
                        </td>
                        <td className="py-2 px-3 text-center whitespace-nowrap">
                          {peak > 0 ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-100 text-rose-800 font-bold border border-rose-200">
                              {peak}m
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-[11px]">0m</span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            onClick={() => handleDeleteActivity(act.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* PEM Episodes Table */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>PEM Symptom Logs ({pems.length})</span>
            </h3>
            <button
              onClick={() => setIsPemModalOpen(true)}
              className="text-xs text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log Episode</span>
            </button>
          </div>

          <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-slate-50 text-slate-700 border-b border-slate-200 z-10 font-semibold">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3 text-center">Fatigue</th>
                  <th className="py-2.5 px-3 text-center">Malaise</th>
                  <th className="py-2.5 px-3 text-center">Brain Fog</th>
                  <th className="py-2.5 px-3 text-center">Headache</th>
                  <th className="py-2.5 px-2 text-center w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {pems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                      No PEM symptom episodes logged yet.
                    </td>
                  </tr>
                ) : (
                  pems.map((pem) => (
                    <tr key={pem.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2 px-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                        {pem.pem_date.substring(5, 16)}
                      </td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                            pem.fatigue >= 7
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : pem.fatigue >= 4
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}
                        >
                          {pem.fatigue}/10
                        </span>
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-700 whitespace-nowrap">
                        {pem.general_malaise}/10
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-700 whitespace-nowrap">
                        {pem.brain_fog}/10
                      </td>
                      <td className="py-2 px-3 text-center font-mono text-slate-700 whitespace-nowrap">
                        {pem.headache}/10
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          onClick={() => handleDeletePem(pem.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Log Activity Modal (Light Theme) */}
      {isActivityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl text-slate-900 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold text-slate-900">Log Energy &amp; Activity</h3>
              </div>
              <button
                onClick={() => setIsActivityModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveActivity} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-slate-600 font-medium">Activity Date &amp; Time</label>
                  <input
                    type="datetime-local"
                    value={activityForm.activity_date}
                    onChange={(e) => setActivityForm({ ...activityForm, activity_date: e.target.value })}
                    required
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-600 font-medium">Activity Name</label>
                  <input
                    type="text"
                    value={activityForm.activity_name}
                    placeholder="e.g. Gentle Walk, Typing, Rest"
                    onChange={(e) => setActivityForm({ ...activityForm, activity_name: e.target.value })}
                    required
                    className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-slate-600 font-medium">Duration (minutes)</label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={activityForm.duration}
                  onChange={(e) => setActivityForm({ ...activityForm, duration: Number(e.target.value) })}
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                />
              </div>

              {/* Step counter deltas */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <p className="font-semibold text-slate-800">Steps Counter (Start / End)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-500 text-[11px]">Start Steps</label>
                    <input
                      type="number"
                      value={activityForm.start_steps}
                      onChange={(e) => setActivityForm({ ...activityForm, start_steps: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 text-[11px]">End Steps</label>
                    <input
                      type="number"
                      value={activityForm.end_steps}
                      onChange={(e) => setActivityForm({ ...activityForm, end_steps: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-teal-700 font-medium">
                  Delta: +{Math.max(0, activityForm.end_steps - activityForm.start_steps)} steps
                </p>
              </div>

              {/* Calories deltas */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <p className="font-semibold text-slate-800">Active Calories (Start / End)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-slate-500 text-[11px]">Start Calories</label>
                    <input
                      type="number"
                      value={activityForm.start_calories}
                      onChange={(e) => setActivityForm({ ...activityForm, start_calories: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 text-[11px]">End Calories</label>
                    <input
                      type="number"
                      value={activityForm.end_calories}
                      onChange={(e) => setActivityForm({ ...activityForm, end_calories: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-amber-700 font-medium">
                  Delta: +{Math.max(0, activityForm.end_calories - activityForm.start_calories)} kcal
                </p>
              </div>

              {/* Heart rate & intensity zones */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <p className="font-semibold text-slate-800">Intensity Zone Breakdown (Minutes)</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-slate-500 text-[11px]">Moderate</label>
                    <input
                      type="number"
                      value={activityForm.end_moderate - activityForm.start_moderate}
                      onChange={(e) =>
                        setActivityForm({
                          ...activityForm,
                          start_moderate: 0,
                          end_moderate: Number(e.target.value),
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 text-[11px]">Vigorous</label>
                    <input
                      type="number"
                      value={activityForm.end_vigorous - activityForm.start_vigorous}
                      onChange={(e) =>
                        setActivityForm({
                          ...activityForm,
                          start_vigorous: 0,
                          end_vigorous: Number(e.target.value),
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 text-[11px]">Peak (Anaerobic)</label>
                    <input
                      type="number"
                      value={activityForm.end_peak - activityForm.start_peak}
                      onChange={(e) =>
                        setActivityForm({
                          ...activityForm,
                          start_peak: 0,
                          end_peak: Number(e.target.value),
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-slate-900"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsActivityModalOpen(false)}
                  className="px-4 py-2.5 rounded-lg text-slate-600 hover:text-slate-900 font-medium min-h-[40px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium shadow-sm min-h-[42px]"
                >
                  Save Activity Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log PEM Episode Modal (Light Theme) */}
      {isPemModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 sm:p-6 shadow-2xl text-slate-900 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">Log Post-Exertional Malaise (PEM)</h3>
              </div>
              <button
                onClick={() => setIsPemModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePem} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-600 font-medium">PEM Episode Date &amp; Time</label>
                <input
                  type="datetime-local"
                  value={pemForm.pem_date}
                  onChange={(e) => setPemForm({ ...pemForm, pem_date: e.target.value })}
                  required
                  className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-slate-900 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                />
              </div>

              {/* Sliders for symptom severities (0 - 10) */}
              <div className="space-y-3.5 pt-1">
                {[
                  { key: 'fatigue', label: 'Fatigue Severity', icon: Brain, color: 'text-indigo-600' },
                  { key: 'general_malaise', label: 'General Malaise (Flu-like feeling)', icon: AlertTriangle, color: 'text-rose-600' },
                  { key: 'brain_fog', label: 'Brain Fog / Cognitive Dysfunction', icon: Sparkles, color: 'text-amber-600' },
                  { key: 'headache', label: 'Headache / Pressure', icon: HeartPulse, color: 'text-rose-600' },
                  { key: 'eye_stinging', label: 'Eye Stinging / Sensory Overload', icon: EyeIcon, color: 'text-teal-600' },
                ].map(({ key, label, icon: Icon, color }) => {
                  const val = (pemForm as any)[key];
                  return (
                    <div key={key} className="space-y-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between font-medium">
                        <span className="flex items-center gap-1.5 text-slate-800">
                          <Icon className={`w-3.5 h-3.5 ${color}`} />
                          <span>{label}</span>
                        </span>
                        <span className="font-mono text-slate-900 font-bold px-2 py-0.5 bg-white rounded border border-slate-200 shadow-xs">
                          {val} / 10
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="1"
                        value={val}
                        onChange={(e) => setPemForm({ ...pemForm, [key]: Number(e.target.value) })}
                        className="w-full accent-teal-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPemModalOpen(false)}
                  className="px-4 py-2.5 rounded-lg text-slate-600 hover:text-slate-900 font-medium min-h-[40px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium shadow-sm min-h-[42px]"
                >
                  Save PEM Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper eye icon for eye stinging
const EyeIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const pacingTrackerPlugin: Plugin = {
  metadata: {
    id: 'pacing-tracker',
    name: 'Pacing & Daily Energy Tracker',
    version: '1.0.0',
    description: 'Tracks daily energy envelope, active steps, calories, intensity zones, and 24-48h PEM crash correlation.',
    icon: 'HeartPulse',
  },
  initialize(context: PluginContext) {
    // 1. Register Nav Bar Link (Main Dashboard)
    context.registerNavItem({
      id: 'dashboard',
      label: 'Pacing Dashboard',
      icon: 'HeartPulse',
      viewId: 'dashboard',
      order: 10,
    });

    // 2. Register Menu Item
    context.registerMenuItem({
      id: 'menu-dashboard',
      label: 'Pacing Dashboard',
      icon: 'HeartPulse',
      action: () => context.navigateTo('dashboard'),
      order: 10,
    });

    // 3. Register Primary View
    context.registerView({
      id: 'dashboard',
      title: 'Pacing & Daily Energy Management',
      component: PacingTrackerView,
    });
  },
};

export default pacingTrackerPlugin;
