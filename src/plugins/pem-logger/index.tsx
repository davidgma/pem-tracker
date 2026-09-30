/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Plugin, PluginContext } from '../plugin.types';
import { PEMRecord } from '../../types/database.types';
import {
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Clock,
  Calendar,
  X,
  Check,
  Brain,
  Zap,
  ShieldAlert,
  AlertCircle,
  HelpCircle,
  Info,
  TrendingUp,
  RotateCcw,
} from 'lucide-react';

interface SymptomConfig {
  key: 'headache' | 'fatigue' | 'eye_stinging' | 'general_malaise' | 'brain_fog';
  label: string;
  description: string;
}

const SYMPTOMS: SymptomConfig[] = [
  {
    key: 'fatigue',
    label: 'Fatigue',
    description: 'Profound physical exhaustion not relieved by sleep or rest',
  },
  {
    key: 'general_malaise',
    label: 'General Malaise',
    description: 'Systemic flu-like feeling, poisoned sensation, or bodily crash',
  },
  {
    key: 'brain_fog',
    label: 'Brain Fog',
    description: 'Cognitive slowdown, memory lapses, trouble formulating thoughts',
  },
  {
    key: 'headache',
    label: 'Headache',
    description: 'Tension, throbbing, pressure, or temple headache',
  },
  {
    key: 'eye_stinging',
    label: 'Eyes Stinging',
    description: 'Ocular stinging, burning sensation, or light intolerance',
  },
];

function getLocalDateTimeString(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const yyyy = date.getFullYear();
  const MM = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
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

function getScoreBadge(score: number): { text: string; bg: string; border: string; color: string } {
  if (score === -1) {
    return {
      text: 'Unsure (-1)',
      bg: 'bg-slate-100',
      border: 'border-slate-300',
      color: 'text-slate-600',
    };
  }
  if (score === 0) {
    return {
      text: 'None (0)',
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      color: 'text-slate-400',
    };
  }
  if (score <= 3) {
    return {
      text: `${score}/10 (Mild)`,
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      color: 'text-emerald-700 font-semibold',
    };
  }
  if (score <= 6) {
    return {
      text: `${score}/10 (Moderate)`,
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      color: 'text-amber-800 font-semibold',
    };
  }
  return {
    text: `${score}/10 (Severe)`,
    bg: 'bg-rose-50',
    border: 'border-rose-300',
    color: 'text-rose-700 font-bold',
  };
}

/**
 * Interactive Symptom Rating Selector (Supports -1, 0, and 1-10)
 */
const SymptomRatingSelector: React.FC<{
  label: string;
  description: string;
  value: number;
  onChange: (val: number) => void;
}> = ({ label, description, value, onChange }) => {
  return (
    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
        <div>
          <span className="text-xs font-semibold text-slate-800">{label}</span>
          <span className="text-[11px] text-slate-500 block">{description}</span>
        </div>
        <div className="shrink-0">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs border ${
              getScoreBadge(value).bg
            } ${getScoreBadge(value).border} ${getScoreBadge(value).color}`}
          >
            {getScoreBadge(value).text}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {/* Unsure / Don't know button (-1) */}
        <button
          type="button"
          onClick={() => onChange(-1)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${
            value === -1
              ? 'bg-slate-700 text-white border-slate-700 shadow-xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
          title="Mark -1: Don't know or not sure (e.g. unassessed brain fog)"
        >
          <HelpCircle className="w-3 h-3" />
          <span>Not Sure (-1)</span>
        </button>

        {/* None button (0) */}
        <button
          type="button"
          onClick={() => onChange(0)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
            value === 0
              ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
          title="0: No symptom present"
        >
          None (0)
        </button>

        {/* 1 to 10 Scale Buttons */}
        <div className="flex items-center gap-1 overflow-x-auto py-0.5">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
            const isSelected = value === num;
            let activeColor = 'bg-teal-600 text-white border-teal-600';
            if (num >= 4 && num <= 6) activeColor = 'bg-amber-600 text-white border-amber-600';
            if (num >= 7) activeColor = 'bg-rose-600 text-white border-rose-600';

            return (
              <button
                key={num}
                type="button"
                onClick={() => onChange(num)}
                className={`w-7 h-7 rounded-lg text-xs font-semibold flex items-center justify-center border transition-all ${
                  isSelected
                    ? `${activeColor} shadow-xs ring-2 ring-offset-1 ring-slate-400`
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {num}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const PEMLoggerView: React.FC<{ context: PluginContext }> = ({ context }) => {
  const [records, setRecords] = useState<PEMRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    pem_date: getLocalDateTimeString(),
    headache: 0,
    fatigue: 5,
    eye_stinging: 0,
    general_malaise: 4,
    brain_fog: 3,
  });

  const loadRecords = async () => {
    try {
      setIsLoading(true);
      const data = await context.database.getAllPEMs();
      setRecords(data);
    } catch (e) {
      console.error('Failed to load PEM records:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
    const unsub = context.database.addChangeListener(() => {
      loadRecords();
    });
    return () => unsub();
  }, [context]);

  const handleOpenCreateModal = () => {
    setEditingId(null);
    setFormData({
      pem_date: getLocalDateTimeString(),
      headache: 0,
      fatigue: 6,
      eye_stinging: 0,
      general_malaise: 5,
      brain_fog: 4,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (rec: PEMRecord) => {
    setEditingId(rec.id);
    let dateStr = getLocalDateTimeString();
    try {
      const d = new Date(rec.pem_date);
      if (!isNaN(d.getTime())) {
        dateStr = getLocalDateTimeString(d);
      }
    } catch {
      // fallback
    }

    setFormData({
      pem_date: dateStr,
      headache: rec.headache ?? 0,
      fatigue: rec.fatigue ?? 0,
      eye_stinging: rec.eye_stinging ?? 0,
      general_malaise: rec.general_malaise ?? 0,
      brain_fog: rec.brain_fog ?? 0,
    });
    setIsModalOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const isoDate = new Date(formData.pem_date).toISOString();

      if (editingId) {
        const existing = records.find((r) => r.id === editingId);
        await context.database.updatePEM({
          id: editingId,
          pem_date: isoDate,
          headache: formData.headache,
          fatigue: formData.fatigue,
          eye_stinging: formData.eye_stinging,
          general_malaise: formData.general_malaise,
          brain_fog: formData.brain_fog,
          client_uuid: existing?.client_uuid,
          updated_at: new Date().toISOString(),
        });
        context.showNotification('Record Updated', 'PEM crash record was successfully updated in t_pems', 'success');
      } else {
        await context.database.insertPEM({
          pem_date: isoDate,
          headache: formData.headache,
          fatigue: formData.fatigue,
          eye_stinging: formData.eye_stinging,
          general_malaise: formData.general_malaise,
          brain_fog: formData.brain_fog,
        });
        context.showNotification('PEM Crash Logged', 'New crash instance added to t_pems', 'success');
      }

      setIsModalOpen(false);
      await loadRecords();
    } catch (err: any) {
      console.error('Error saving PEM record:', err);
      context.showNotification('Save Error', err.message || 'Failed to save PEM record', 'error');
    }
  };

  const handleDelete = async (rec: PEMRecord) => {
    if (!confirm(`Are you sure you want to delete the PEM record from ${formatDisplayDate(rec.pem_date)}?`)) {
      return;
    }
    try {
      await context.database.deletePEM(rec.id);
      context.showNotification('Record Deleted', 'PEM crash instance was removed from t_pems', 'info');
      await loadRecords();
    } catch (err: any) {
      context.showNotification('Delete Error', err.message || 'Failed to delete PEM record', 'error');
    }
  };

  const handleDuplicate = async (rec: PEMRecord) => {
    try {
      const nowIso = new Date().toISOString();
      await context.database.insertPEM({
        pem_date: nowIso,
        headache: rec.headache ?? 0,
        fatigue: rec.fatigue ?? 0,
        eye_stinging: rec.eye_stinging ?? 0,
        general_malaise: rec.general_malaise ?? 0,
        brain_fog: rec.brain_fog ?? 0,
      });
      context.showNotification(
        'Record Duplicated',
        `Duplicated crash record with current timestamp (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`,
        'success'
      );
      await loadRecords();
    } catch (err: any) {
      context.showNotification('Duplicate Error', err.message || 'Failed to duplicate record', 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-2">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center shadow-xs">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">PEM Crash Records</h2>
            <span className="font-mono text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {records.length} {records.length === 1 ? 'crash' : 'crashes'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Logged only when experiencing a post-exertional malaise crash. Maintained in <code className="font-mono text-rose-700 bg-rose-50 px-1 py-0.5 rounded border border-rose-200">t_pems</code> to correlate with previous days&apos; exertion activities and establish safe energy thresholds.
          </p>
        </div>

        <button
          onClick={handleOpenCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs sm:text-sm transition-colors shadow-sm self-start sm:self-auto min-h-[42px]"
        >
          <Plus className="w-4 h-4" />
          <span>Log PEM Crash</span>
        </button>
      </div>

      {/* Info Banner */}
      <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-4 text-xs text-slate-700 flex items-start gap-3">
        <Info className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-rose-950">How crash records are evaluated</p>
          <p className="text-slate-600 leading-relaxed">
            Record an entry whenever you experience a PEM crash episode. Each symptom accepts an intensity score from <strong>0</strong> (none) to <strong>10</strong> (severe), or <strong>-1</strong> for symptoms you are unsure about (e.g. brain fog when not performing complex cognitive tasks).
          </p>
        </div>
      </div>

      {/* Previous Records List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Previous PEM Crash Episodes (Most Recent First)</span>
          </h3>
          <span className="text-[11px] text-slate-400">Stored in t_pems</span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading crash records...</div>
        ) : records.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center space-y-3 bg-white">
            <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-400 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-sm">No PEM crashes logged yet</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Only create a record when you experience a post-exertional crash episode to build a clean baseline against previous activities.
              </p>
            </div>
            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Log First Crash</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {records.map((rec) => {
              // Calculate average of assessed positive symptoms
              const scores = [
                rec.headache,
                rec.fatigue,
                rec.eye_stinging,
                rec.general_malaise,
                rec.brain_fog,
              ].filter((v): v is number => v !== undefined && v !== null && v >= 0);

              const avgScore =
                scores.length > 0
                  ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)
                  : 'N/A';

              return (
                <div
                  key={rec.id}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs hover:border-slate-300 transition-all space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                      <span className="font-semibold text-xs sm:text-sm text-slate-900">
                        {formatDisplayDate(rec.pem_date)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-auto">
                      <span className="text-[11px] font-mono text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md mr-2">
                        Avg Severity: <strong>{avgScore}</strong>/10
                      </span>

                      <button
                        onClick={() => handleDuplicate(rec)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 transition-colors shadow-xs"
                        title="Duplicate this record with current timestamp"
                      >
                        <Copy className="w-3.5 h-3.5 text-slate-500" />
                        <span>Duplicate</span>
                      </button>

                      <button
                        onClick={() => handleOpenEditModal(rec)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-teal-700 bg-white hover:bg-teal-50 border border-slate-200 transition-colors shadow-xs"
                        title="Edit record"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>

                      <button
                        onClick={() => handleDelete(rec)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition-colors"
                        title="Delete record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 5 Symptoms Visual Badges */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 text-xs">
                    {SYMPTOMS.map((sym) => {
                      const val = (rec[sym.key] as number) ?? 0;
                      const badge = getScoreBadge(val);
                      return (
                        <div
                          key={sym.key}
                          className="rounded-lg border border-slate-100 bg-slate-50/70 p-2 space-y-1"
                        >
                          <span className="text-[11px] font-medium text-slate-500 block truncate">
                            {sym.label}
                          </span>
                          <span
                            className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-md border ${badge.bg} ${badge.border} ${badge.color}`}
                          >
                            {badge.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/60">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  {editingId ? 'Edit PEM Crash Record' : 'Log New PEM Crash Instance'}
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
              {/* Field 1: Datetime Stamp */}
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <span>Date &amp; Time Stamp *</span>
                </label>
                <input
                  type="datetime-local"
                  required
                  value={formData.pem_date}
                  onChange={(e) => setFormData({ ...formData, pem_date: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:border-rose-600 focus:ring-1 focus:ring-rose-600"
                />
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Defaults to the current date and time of record creation.
                </p>
              </div>

              {/* Fields 2-6: Symptoms Severity Rating */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Symptom Severity (0 to 10 scale, or -1 for unsure)
                  </span>
                  <span className="text-[11px] text-slate-400">Integer scores</span>
                </div>

                {SYMPTOMS.map((sym) => (
                  <SymptomRatingSelector
                    key={sym.key}
                    label={sym.label}
                    description={sym.description}
                    value={formData[sym.key]}
                    onChange={(val) => setFormData({ ...formData, [sym.key]: val })}
                  />
                ))}
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
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingId ? 'Update PEM Record' : 'Save PEM Crash'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const pemLoggerPlugin: Plugin = {
  metadata: {
    id: 'pem-logger',
    name: 'PEM Crash Records',
    version: '1.0.0',
    description: 'Log and monitor post-exertional malaise crash episodes to identify activity ceilings.',
    icon: 'AlertTriangle',
  },
  initialize(context: PluginContext) {
    // 1. Register Nav Bar Link (Order 12, just to the right of 'Pacing Dashboard' at order 10)
    context.registerNavItem({
      id: 'pem-logger',
      label: 'PEM Records',
      icon: 'AlertTriangle',
      viewId: 'pem-logger',
      order: 12,
    });

    // 2. Register Menu Item
    context.registerMenuItem({
      id: 'menu-pem-logger',
      label: 'PEM Crash Records',
      icon: 'AlertTriangle',
      action: () => context.navigateTo('pem-logger'),
      order: 12,
    });

    // 3. Register Dedicated View
    context.registerView({
      id: 'pem-logger',
      title: 'PEM Crash Records',
      component: PEMLoggerView,
    });
  },
};

export default pemLoggerPlugin;
