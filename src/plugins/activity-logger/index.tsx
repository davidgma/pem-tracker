/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Plugin, PluginContext } from '../plugin.types';
import { ActivityRecord } from '../../types/database.types';
import {
  Footprints,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Clock,
  Calendar,
  X,
  Check,
  Flame,
  Activity,
  HeartPulse,
  Info,
  Settings,
  ChevronDown,
  Layers,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

function getLocalDateTimeString(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
}

function getDateDayKey(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr.substring(0, 10);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } catch {
    return dateStr.substring(0, 10);
  }
}

function formatDisplayDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString(undefined, {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export const ActivityLoggerView: React.FC<{ context: PluginContext }> = ({ context }) => {
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [defaultDuration, setDefaultDuration] = useState<number>(60);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Activity name selection/creation state
  const [isCreatingName, setIsCreatingName] = useState(false);
  const [customNameInput, setCustomNameInput] = useState('');

  // Default duration configuration modal state
  const [isDurationModalOpen, setIsDurationModalOpen] = useState(false);
  const [durationInput, setDurationInput] = useState<number>(60);

  // Form State
  const [formData, setFormData] = useState({
    activity_date: getLocalDateTimeString(),
    activity_name: 'Walking',
    duration: 60,
    start_steps: 0,
    end_steps: 0,
    start_calories: 0,
    end_calories: 0,
    start_moderate: 0,
    end_moderate: 0,
    start_vigorous: 0,
    end_vigorous: 0,
    start_peak: 0,
    end_peak: 0,
  });

  const loadActivitiesAndSettings = async () => {
    try {
      setIsLoading(true);
      const data = await context.database.getAllActivities();
      setActivities(data);

      // Load default_activity_duration from t_settings
      const durStr = await context.database.getSetting('default_activity_duration', '60');
      const dur = parseInt(durStr || '60', 10);
      const safeDur = isNaN(dur) || dur <= 0 ? 60 : dur;
      setDefaultDuration(safeDur);
      setDurationInput(safeDur);
    } catch (e) {
      console.error('Failed to load activities or settings:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadActivitiesAndSettings();
    const unsub = context.database.addChangeListener(() => {
      loadActivitiesAndSettings();
    });
    return () => unsub();
  }, [context]);

  // List of all previous unique activity names
  const existingActivityNames = useMemo(() => {
    const names = new Set<string>();
    activities.forEach((a) => {
      if (a.activity_name && a.activity_name.trim()) {
        names.add(a.activity_name.trim());
      }
    });
    if (names.size === 0) {
      names.add('Walking');
      names.add('Household Chores');
      names.add('Yoga / Stretching');
      names.add('Gentle Cycling');
      names.add('Errands / Groceries');
    }
    return Array.from(names).sort();
  }, [activities]);

  const handleOpenCreateModal = () => {
    setEditingId(null);
    setIsCreatingName(false);
    setCustomNameInput('');

    const nowStr = getLocalDateTimeString();
    const todayKey = getDateDayKey(nowStr);

    // Default activity name: name of the most recent activity, or 'Walking'
    const mostRecent = activities[0];
    const defaultName = mostRecent?.activity_name || 'Walking';

    // Defaults rule for starting figures:
    // Ending numbers of the last activity recorded earlier the same day, or 0 if first record for day
    const sameDayActs = activities.filter((a) => getDateDayKey(a.activity_date) === todayKey);
    let startSteps = 0;
    let startCalories = 0;
    let startModerate = 0;
    let startVigorous = 0;
    let startPeak = 0;

    if (sameDayActs.length > 0) {
      const lastSameDay = sameDayActs[0]; // sorted DESC, so [0] is latest that day
      startSteps = lastSameDay.end_steps ?? 0;
      startCalories = lastSameDay.end_calories ?? 0;
      startModerate = lastSameDay.end_moderate ?? 0;
      startVigorous = lastSameDay.end_vigorous ?? 0;
      startPeak = lastSameDay.end_peak ?? 0;
    }

    // Default ending figures: exact same numbers as the starting numbers
    setFormData({
      activity_date: nowStr,
      activity_name: defaultName,
      duration: defaultDuration,
      start_steps: startSteps,
      end_steps: startSteps,
      start_calories: startCalories,
      end_calories: startCalories,
      start_moderate: startModerate,
      end_moderate: startModerate,
      start_vigorous: startVigorous,
      end_vigorous: startVigorous,
      start_peak: startPeak,
      end_peak: startPeak,
    });

    setIsModalOpen(true);
  };

  const handleOpenEditModal = (act: ActivityRecord) => {
    setEditingId(act.id);
    const isKnown = existingActivityNames.includes(act.activity_name || '');
    if (!isKnown && act.activity_name) {
      setIsCreatingName(true);
      setCustomNameInput(act.activity_name);
    } else {
      setIsCreatingName(false);
      setCustomNameInput('');
    }

    let dateStr = getLocalDateTimeString();
    try {
      const d = new Date(act.activity_date);
      if (!isNaN(d.getTime())) {
        dateStr = getLocalDateTimeString(d);
      }
    } catch {
      // fallback
    }

    setFormData({
      activity_date: dateStr,
      activity_name: act.activity_name || 'Walking',
      duration: act.duration ?? defaultDuration,
      start_steps: act.start_steps ?? 0,
      end_steps: act.end_steps ?? 0,
      start_calories: act.start_calories ?? 0,
      end_calories: act.end_calories ?? 0,
      start_moderate: act.start_moderate ?? 0,
      end_moderate: act.end_moderate ?? 0,
      start_vigorous: act.start_vigorous ?? 0,
      end_vigorous: act.end_vigorous ?? 0,
      start_peak: act.start_peak ?? 0,
      end_peak: act.end_peak ?? 0,
    });

    setIsModalOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();

    const chosenName = isCreatingName ? customNameInput.trim() : formData.activity_name.trim();
    if (!chosenName) {
      context.showNotification('Validation Error', 'Activity name is required', 'warning');
      return;
    }

    try {
      const isoDate = new Date(formData.activity_date).toISOString();

      if (editingId) {
        const existing = activities.find((a) => a.id === editingId);
        await context.database.updateActivity({
          id: editingId,
          activity_date: isoDate,
          activity_name: chosenName,
          duration: Number(formData.duration) || 0,
          start_steps: Number(formData.start_steps) || 0,
          end_steps: Number(formData.end_steps) || 0,
          start_calories: Number(formData.start_calories) || 0,
          end_calories: Number(formData.end_calories) || 0,
          start_moderate: Number(formData.start_moderate) || 0,
          end_moderate: Number(formData.end_moderate) || 0,
          start_vigorous: Number(formData.start_vigorous) || 0,
          end_vigorous: Number(formData.end_vigorous) || 0,
          start_peak: Number(formData.start_peak) || 0,
          end_peak: Number(formData.end_peak) || 0,
          client_uuid: existing?.client_uuid,
          updated_at: new Date().toISOString(),
        });
        context.showNotification('Activity Updated', `Updated "${chosenName}" in t_activities`, 'success');
      } else {
        await context.database.insertActivity({
          activity_date: isoDate,
          activity_name: chosenName,
          duration: Number(formData.duration) || 0,
          start_steps: Number(formData.start_steps) || 0,
          end_steps: Number(formData.end_steps) || 0,
          start_calories: Number(formData.start_calories) || 0,
          end_calories: Number(formData.end_calories) || 0,
          start_moderate: Number(formData.start_moderate) || 0,
          end_moderate: Number(formData.end_moderate) || 0,
          start_vigorous: Number(formData.start_vigorous) || 0,
          end_vigorous: Number(formData.end_vigorous) || 0,
          start_peak: Number(formData.start_peak) || 0,
          end_peak: Number(formData.end_peak) || 0,
        });
        context.showNotification('Activity Recorded', `Logged "${chosenName}" in t_activities`, 'success');
      }

      setIsModalOpen(false);
      await loadActivitiesAndSettings();
    } catch (err: any) {
      console.error('Error saving activity record:', err);
      context.showNotification('Save Error', err.message || 'Failed to save activity record', 'error');
    }
  };

  const handleDelete = async (act: ActivityRecord) => {
    if (!confirm(`Delete activity "${act.activity_name}" from ${formatDisplayDate(act.activity_date)}?`)) {
      return;
    }
    try {
      await context.database.deleteActivity(act.id);
      context.showNotification('Activity Deleted', 'Record was removed from t_activities', 'info');
      await loadActivitiesAndSettings();
    } catch (err: any) {
      context.showNotification('Delete Error', err.message || 'Failed to delete activity', 'error');
    }
  };

  const handleDuplicate = async (act: ActivityRecord) => {
    try {
      const nowIso = new Date().toISOString();
      await context.database.insertActivity({
        activity_date: nowIso,
        activity_name: act.activity_name,
        duration: act.duration ?? 60,
        start_steps: act.start_steps ?? 0,
        end_steps: act.end_steps ?? 0,
        start_calories: act.start_calories ?? 0,
        end_calories: act.end_calories ?? 0,
        start_moderate: act.start_moderate ?? 0,
        end_moderate: act.end_moderate ?? 0,
        start_vigorous: act.start_vigorous ?? 0,
        end_vigorous: act.end_vigorous ?? 0,
        start_peak: act.start_peak ?? 0,
        end_peak: act.end_peak ?? 0,
      });
      context.showNotification(
        'Activity Duplicated',
        `Duplicated "${act.activity_name}" with current timestamp (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
        'success'
      );
      await loadActivitiesAndSettings();
    } catch (err: any) {
      context.showNotification('Duplicate Error', err.message || 'Failed to duplicate activity', 'error');
    }
  };

  const handleSaveDefaultDuration = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(durationInput);
    if (isNaN(val) || val <= 0) return;

    try {
      await context.database.setSetting('default_activity_duration', String(val));
      setDefaultDuration(val);
      setIsDurationModalOpen(false);
      context.showNotification('Setting Saved', `Default activity duration set to ${val} minutes in t_settings`, 'success');
    } catch (err: any) {
      context.showNotification('Error', err.message || 'Failed to save default duration', 'error');
    }
  };

  // Deltas computation for modal preview
  const deltaSteps = Math.max(0, (Number(formData.end_steps) || 0) - (Number(formData.start_steps) || 0));
  const deltaCalories = Math.max(0, (Number(formData.end_calories) || 0) - (Number(formData.start_calories) || 0));
  const deltaModerate = Math.max(0, (Number(formData.end_moderate) || 0) - (Number(formData.start_moderate) || 0));
  const deltaVigorous = Math.max(0, (Number(formData.end_vigorous) || 0) - (Number(formData.start_vigorous) || 0));
  const deltaPeak = Math.max(0, (Number(formData.end_peak) || 0) - (Number(formData.start_peak) || 0));

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center shadow-xs">
              <Footprints className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Activity &amp; Exertion Log</h2>
            <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {activities.length} {activities.length === 1 ? 'activity' : 'activities'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Record physical or cognitive exertion sessions that might trigger a post-exertional crash. Maintained in <code className="font-mono text-teal-700 bg-teal-50 px-1 py-0.5 rounded border border-teal-200">t_activities</code> with starting and ending Fitbit Air / Google Health cumulative figures.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => setIsDurationModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors shadow-xs min-h-[42px]"
            title="Configure default activity duration stored in t_settings"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Default Duration:</span>
            <strong>{defaultDuration}m</strong>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs sm:text-sm transition-colors shadow-sm min-h-[42px]"
          >
            <Plus className="w-4 h-4" />
            <span>Record Activity</span>
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4 text-xs text-slate-700 flex items-start gap-3">
        <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-teal-950">How activity readings are tracked</p>
          <p className="text-slate-600 leading-relaxed">
            Starting figures are read from your Google Health app (connected to your Fitbit Air) before beginning the activity. They default to the previous activity&apos;s ending numbers for that day, or <strong>0</strong> if it is the first record of the day. Ending figures are entered when finished.
          </p>
        </div>
      </div>

      {/* Activities Records List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Previous Activity Sessions (Most Recent First)</span>
          </h3>
          <span className="text-[11px] text-slate-400">Stored in t_activities</span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading activity sessions...</div>
        ) : activities.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center space-y-3 bg-white">
            <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center mx-auto">
              <Footprints className="w-6 h-6 text-teal-500" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-sm">No activities logged yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Log activities that you think might impact your likelihood of experiencing a PEM crash the following day.
              </p>
            </div>
            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record First Activity</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {activities.map((act) => {
              const dSteps = Math.max(0, (act.end_steps ?? 0) - (act.start_steps ?? 0));
              const dCals = Math.max(0, (act.end_calories ?? 0) - (act.start_calories ?? 0));
              const dMod = Math.max(0, (act.end_moderate ?? 0) - (act.start_moderate ?? 0));
              const dVig = Math.max(0, (act.end_vigorous ?? 0) - (act.start_vigorous ?? 0));
              const dPeak = Math.max(0, (act.end_peak ?? 0) - (act.start_peak ?? 0));
              const dActiveMins = dMod + dVig + dPeak;

              return (
                <div
                  key={act.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-slate-300 transition-all space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-500"></span>
                      <div>
                        <span className="font-bold text-sm text-slate-900 mr-2">
                          {act.activity_name}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">
                          {formatDisplayDate(act.activity_date)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <span className="text-[11px] font-mono text-slate-600 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md mr-1">
                        Duration: <strong>{act.duration ?? 0}</strong> mins
                      </span>

                      <button
                        onClick={() => handleDuplicate(act)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 transition-colors shadow-xs"
                        title="Duplicate this record with current timestamp"
                      >
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>Duplicate</span>
                      </button>

                      <button
                        onClick={() => handleOpenEditModal(act)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-teal-700 bg-white hover:bg-teal-50 border border-slate-200 transition-colors shadow-xs"
                        title="Edit record"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => handleDelete(act)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors"
                        title="Delete record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Net Activity Contributions */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                    {/* Steps */}
                    <div className="rounded-lg border border-teal-100 bg-teal-50/50 p-2.5">
                      <span className="text-[11px] font-medium text-teal-800 flex items-center gap-1">
                        <Footprints className="w-3 h-3 text-teal-600" />
                        <span>Steps Gained</span>
                      </span>
                      <div className="text-sm font-bold text-teal-950 mt-0.5">
                        +{dSteps.toLocaleString()}{' '}
                        <span className="text-[10px] font-normal text-slate-500 font-mono">
                          ({act.start_steps} &rarr; {act.end_steps})
                        </span>
                      </div>
                    </div>

                    {/* Calories */}
                    <div className="rounded-lg border border-amber-100 bg-amber-50/50 p-2.5">
                      <span className="text-[11px] font-medium text-amber-800 flex items-center gap-1">
                        <Flame className="w-3 h-3 text-amber-600" />
                        <span>Energy Burned</span>
                      </span>
                      <div className="text-sm font-bold text-amber-950 mt-0.5">
                        +{dCals}{' '}
                        <span className="text-[10px] font-normal text-slate-500 font-mono">
                          kCals ({act.start_calories} &rarr; {act.end_calories})
                        </span>
                      </div>
                    </div>

                    {/* Active Minutes */}
                    <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-2.5">
                      <span className="text-[11px] font-medium text-indigo-800 flex items-center gap-1">
                        <Activity className="w-3 h-3 text-indigo-600" />
                        <span>Active Zone Mins</span>
                      </span>
                      <div className="text-sm font-bold text-indigo-950 mt-0.5">
                        +{dActiveMins}{' '}
                        <span className="text-[10px] font-normal text-slate-500 font-mono">
                          mins
                        </span>
                      </div>
                    </div>

                    {/* HR Zones Breakdown */}
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                      <span className="text-[11px] font-medium text-slate-600 flex items-center gap-1">
                        <HeartPulse className="w-3 h-3 text-rose-500" />
                        <span>HR Zones</span>
                      </span>
                      <div className="text-[11px] text-slate-700 font-mono mt-0.5">
                        Mod: <strong>+{dMod}m</strong> · Vig: <strong>+{dVig}m</strong> · Peak: <strong>+{dPeak}m</strong>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Record / Edit Activity Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2">
                <Footprints className="w-4 h-4 text-teal-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  {editingId ? 'Edit Activity Session' : 'Record Activity Session'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Datetime Stamp */}
                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-800 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    <span>Date &amp; Time *</span>
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.activity_date}
                    onChange={(e) => setFormData({ ...formData, activity_date: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  />
                </div>

                {/* Activity Name with Dropdown + Creator */}
                <div className="sm:col-span-1">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-800">
                      Activity Name *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !isCreatingName;
                        setIsCreatingName(next);
                        if (next) setCustomNameInput('');
                      }}
                      className="text-[11px] font-medium text-teal-600 hover:text-teal-700 hover:underline flex items-center gap-0.5"
                    >
                      {isCreatingName ? 'Pick previous' : '+ New name'}
                    </button>
                  </div>

                  {isCreatingName ? (
                    <input
                      type="text"
                      autoFocus
                      required
                      placeholder="e.g. Swimming, Gardening"
                      value={customNameInput}
                      onChange={(e) => setCustomNameInput(e.target.value)}
                      className="w-full bg-white border border-teal-500 ring-1 ring-teal-500 rounded-lg px-2.5 py-2 text-xs text-slate-900 focus:outline-none"
                    />
                  ) : (
                    <select
                      value={formData.activity_name}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setIsCreatingName(true);
                          setCustomNameInput('');
                        } else {
                          setFormData({ ...formData, activity_name: e.target.value });
                        }
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                    >
                      {existingActivityNames.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                      <option value="__NEW__">+ Enter new activity name...</option>
                    </select>
                  )}
                </div>

                {/* Activity Duration */}
                <div className="sm:col-span-1">
                  <label className="block text-xs font-semibold text-slate-800 mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    <span>Duration (minutes) *</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Default from t_settings ({defaultDuration}m)</span>
                </div>
              </div>

              {/* Fitbit Air / Google Health Cumulative Readings */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-200 pb-2">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-teal-600" />
                    <span>Google Health / Fitbit Air Cumulative Readings</span>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Enter starting (pre-activity) and ending (post-activity) numbers
                  </span>
                </div>

                {/* Steps & Calories Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Steps */}
                  <div className="rounded-lg bg-white p-3 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                      <span className="flex items-center gap-1 text-teal-800">
                        <Footprints className="w-3.5 h-3.5 text-teal-600" />
                        <span>Steps (Count)</span>
                      </span>
                      <span className="font-mono text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-200">
                        +{deltaSteps} steps
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-500 font-medium block mb-1">
                          Starting (at start of session):
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={formData.start_steps}
                          onChange={(e) =>
                            setFormData({ ...formData, start_steps: Number(e.target.value) })
                          }
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-xs font-mono text-slate-900"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-medium block mb-1">
                          Ending (at finish):
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={formData.end_steps}
                          onChange={(e) =>
                            setFormData({ ...formData, end_steps: Number(e.target.value) })
                          }
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-xs font-mono text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Calories */}
                  <div className="rounded-lg bg-white p-3 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                      <span className="flex items-center gap-1 text-amber-800">
                        <Flame className="w-3.5 h-3.5 text-amber-600" />
                        <span>Energy (kCals)</span>
                      </span>
                      <span className="font-mono text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        +{deltaCalories} kCals
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-500 font-medium block mb-1">
                          Starting (at start of session):
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={formData.start_calories}
                          onChange={(e) =>
                            setFormData({ ...formData, start_calories: Number(e.target.value) })
                          }
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-xs font-mono text-slate-900"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 font-medium block mb-1">
                          Ending (at finish):
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={formData.end_calories}
                          onChange={(e) =>
                            setFormData({ ...formData, end_calories: Number(e.target.value) })
                          }
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-xs font-mono text-slate-900"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Heart-Rate Zones (Minutes) */}
                <div className="rounded-lg bg-white p-3 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-800">
                    <span className="flex items-center gap-1 text-rose-800">
                      <HeartPulse className="w-3.5 h-3.5 text-rose-600" />
                      <span>Heart-Rate Zone Minutes (Minutes)</span>
                    </span>
                    <span className="font-mono text-slate-600 text-[11px]">
                      Net active: +{deltaModerate + deltaVigorous + deltaPeak} mins
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    {/* Moderate */}
                    <div className="rounded border border-slate-100 p-2 bg-slate-50/50 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                        <span>Moderate Zone</span>
                        <span className="font-mono text-teal-700">+{deltaModerate}m</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="number"
                          min="0"
                          placeholder="Start"
                          value={formData.start_moderate}
                          onChange={(e) =>
                            setFormData({ ...formData, start_moderate: Number(e.target.value) })
                          }
                          className="bg-white border border-slate-300 rounded px-1.5 py-1 text-xs font-mono text-slate-900"
                        />
                        <input
                          type="number"
                          min="0"
                          placeholder="End"
                          value={formData.end_moderate}
                          onChange={(e) =>
                            setFormData({ ...formData, end_moderate: Number(e.target.value) })
                          }
                          className="bg-white border border-slate-300 rounded px-1.5 py-1 text-xs font-mono text-slate-900"
                        />
                      </div>
                    </div>

                    {/* Vigorous */}
                    <div className="rounded border border-slate-100 p-2 bg-slate-50/50 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                        <span>Vigorous Zone</span>
                        <span className="font-mono text-amber-700">+{deltaVigorous}m</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="number"
                          min="0"
                          placeholder="Start"
                          value={formData.start_vigorous}
                          onChange={(e) =>
                            setFormData({ ...formData, start_vigorous: Number(e.target.value) })
                          }
                          className="bg-white border border-slate-300 rounded px-1.5 py-1 text-xs font-mono text-slate-900"
                        />
                        <input
                          type="number"
                          min="0"
                          placeholder="End"
                          value={formData.end_vigorous}
                          onChange={(e) =>
                            setFormData({ ...formData, end_vigorous: Number(e.target.value) })
                          }
                          className="bg-white border border-slate-300 rounded px-1.5 py-1 text-xs font-mono text-slate-900"
                        />
                      </div>
                    </div>

                    {/* Peak */}
                    <div className="rounded border border-slate-100 p-2 bg-slate-50/50 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                        <span>Peak Zone</span>
                        <span className="font-mono text-rose-700">+{deltaPeak}m</span>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="number"
                          min="0"
                          placeholder="Start"
                          value={formData.start_peak}
                          onChange={(e) =>
                            setFormData({ ...formData, start_peak: Number(e.target.value) })
                          }
                          className="bg-white border border-slate-300 rounded px-1.5 py-1 text-xs font-mono text-slate-900"
                        />
                        <input
                          type="number"
                          min="0"
                          placeholder="End"
                          value={formData.end_peak}
                          onChange={(e) =>
                            setFormData({ ...formData, end_peak: Number(e.target.value) })
                          }
                          className="bg-white border border-slate-300 rounded px-1.5 py-1 text-xs font-mono text-slate-900"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingId ? 'Update Activity' : 'Save Activity Session'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Default Duration Setting Modal */}
      {isDurationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-slate-600" />
                <h3 className="font-bold text-sm text-slate-900">Default Activity Duration</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDurationModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDefaultDuration} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Default Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  max="1440"
                  required
                  value={durationInput}
                  onChange={(e) => setDurationInput(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 font-mono focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Stored in <code className="font-mono text-teal-700 bg-teal-50 px-1 py-0.5 rounded">t_settings: default_activity_duration</code>. Used as initial default when creating new records.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDurationModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors shadow-xs"
                >
                  Save Setting
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const activityLoggerPlugin: Plugin = {
  metadata: {
    id: 'activity-logger',
    name: 'Activity & Exertion Logger',
    version: '1.0.0',
    description: 'Record physical and cognitive exertion activities with Google Health / Fitbit Air metric deltas.',
    icon: 'Footprints',
  },
  initialize(context: PluginContext) {
    // 1. Register Nav Bar Link (Order 14, right next to PEM Records at order 12)
    context.registerNavItem({
      id: 'activity-logger',
      label: 'Activities',
      icon: 'Footprints',
      viewId: 'activity-logger',
      order: 14,
    });

    // 2. Register Menu Item
    context.registerMenuItem({
      id: 'menu-activity-logger',
      label: 'Activity & Exertion Log',
      icon: 'Footprints',
      action: () => context.navigateTo('activity-logger'),
      order: 14,
    });

    // 3. Register Dedicated View
    context.registerView({
      id: 'activity-logger',
      title: 'Activity & Exertion Log',
      component: ActivityLoggerView,
    });
  },
};

export default activityLoggerPlugin;
