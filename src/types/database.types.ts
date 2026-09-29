/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PEMRecord {
  id: number;
  pem_date: string; // ISO 8601 or YYYY-MM-DD HH:mm:ss
  headache: number; // 0 - 10
  fatigue: number; // 0 - 10
  eye_stinging: number; // 0 - 10
  general_malaise: number; // 0 - 10
  brain_fog: number; // 0 - 10
  client_uuid?: string;
  updated_at?: string;
}

export interface ActivityRecord {
  id: number;
  activity_date: string;
  activity_name: string;
  duration: number; // minutes
  start_steps: number;
  end_steps: number;
  start_calories: number;
  end_calories: number;
  start_moderate: number;
  end_moderate: number;
  start_vigorous: number;
  end_vigorous: number;
  start_peak: number;
  end_peak: number;
  client_uuid?: string;
  updated_at?: string;
}

export interface ComputedActivityMetrics {
  record: ActivityRecord;
  delta_steps: number;
  delta_calories: number;
  moderate_mins: number;
  vigorous_mins: number;
  peak_mins: number;
  exertion_score: number;
}

export interface QueryExecutionResult {
  columns: string[];
  values: any[][];
  executionTimeMs: number;
  rowsAffected?: number;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'pending' | 'merging' | 'offline' | 'error';
