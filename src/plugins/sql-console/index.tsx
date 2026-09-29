/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Plugin, PluginContext } from '../plugin.types';
import { QueryExecutionResult } from '../../types/database.types';
import {
  Database,
  Play,
  RotateCcw,
  Download,
  Copy,
  Check,
  AlertCircle,
  Table as TableIcon,
  Clock,
  Code2,
} from 'lucide-react';

const PRESET_QUERIES = [
  {
    name: 'Recent PEM Episodes',
    sql: 'SELECT id, pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog FROM t_pems ORDER BY pem_date DESC LIMIT 15;',
  },
  {
    name: 'Recent Daily Activities',
    sql: 'SELECT id, activity_date, activity_name, duration, (end_steps - start_steps) AS delta_steps, (end_calories - start_calories) AS delta_cals, (end_moderate - start_moderate) AS mod_mins, (end_vigorous - start_vigorous) AS vig_mins, (end_peak - start_peak) AS peak_mins FROM t_activities ORDER BY activity_date DESC LIMIT 15;',
  },
  {
    name: 'Daily Energy Expenditure Rollup',
    sql: `SELECT 
  date(activity_date) AS log_date,
  COUNT(*) AS activity_count,
  ROUND(SUM(duration), 1) AS total_duration_mins,
  ROUND(SUM(end_steps - start_steps), 0) AS total_steps,
  ROUND(SUM(end_calories - start_calories), 0) AS total_calories,
  ROUND(SUM(end_moderate - start_moderate), 1) AS mod_mins,
  ROUND(SUM(end_vigorous - start_vigorous), 1) AS vig_mins,
  ROUND(SUM(end_peak - start_peak), 1) AS peak_mins
FROM t_activities 
GROUP BY date(activity_date) 
ORDER BY log_date DESC;`,
  },
  {
    name: 'Exertion vs PEM Crash Lag (Next Day)',
    sql: `SELECT 
  a.activity_day,
  a.total_steps,
  a.total_calories,
  p.pem_day,
  ROUND(p.avg_fatigue, 1) AS next_day_fatigue,
  ROUND(p.avg_malaise, 1) AS next_day_malaise
FROM (
  SELECT date(activity_date) AS activity_day, 
         SUM(end_steps - start_steps) AS total_steps, 
         SUM(end_calories - start_calories) AS total_calories 
  FROM t_activities 
  GROUP BY date(activity_date)
) a
LEFT JOIN (
  SELECT date(pem_date) AS pem_day, 
         AVG(fatigue) AS avg_fatigue, 
         AVG(general_malaise) AS avg_malaise 
  FROM t_pems 
  GROUP BY date(pem_date)
) p ON date(a.activity_day, '+1 day') = p.pem_day
ORDER BY a.activity_day DESC;`,
  },
  {
    name: 'Schema: t_pems info',
    sql: 'PRAGMA table_info(t_pems);',
  },
  {
    name: 'Schema: t_activities info',
    sql: 'PRAGMA table_info(t_activities);',
  },
];

const SQLConsoleView: React.FC<{ context: PluginContext }> = ({ context }) => {
  const [sql, setSql] = useState<string>(PRESET_QUERIES[0].sql);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<QueryExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [tableStats, setTableStats] = useState<{ pems: number; activities: number }>({
    pems: 0,
    activities: 0,
  });

  const refreshTableStats = async () => {
    try {
      const pems = await context.database.getAllPEMs();
      const acts = await context.database.getAllActivities();
      setTableStats({ pems: pems.length, activities: acts.length });
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    refreshTableStats();
    handleRunQuery(PRESET_QUERIES[0].sql);
  }, []);

  const handleRunQuery = async (queryToRun?: string) => {
    const targetSql = (queryToRun || sql).trim();
    if (!targetSql) return;

    setIsRunning(true);
    setError(null);

    try {
      const queryResult = await context.database.executeRawWithStats(targetSql);
      setResult(queryResult);
      await refreshTableStats();
    } catch (err: any) {
      console.error('SQL Execution Error:', err);
      setError(err?.message || 'An error occurred while executing SQL statement');
      setResult(null);
    } finally {
      setIsRunning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleRunQuery();
    }
  };

  const exportCsv = () => {
    if (!result || result.columns.length === 0) return;

    const headers = result.columns.join(',');
    const rows = result.values
      .map((row) =>
        row
          .map((val) => {
            if (val === null || val === undefined) return '';
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          })
          .join(',')
      )
      .join('\n');

    const csvContent = `${headers}\n${rows}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `query_result_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyAsJson = () => {
    if (!result) return;
    const jsonRows = result.values.map((row) => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });

    navigator.clipboard.writeText(JSON.stringify(jsonRows, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto py-2">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-teal-400" />
              <span>SQL Query Console</span>
            </h2>
            <span className="text-[11px] font-mono text-teal-300 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded">
              SQLite3 WASM (Thread-Safe)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Directly execute SQL queries against the active database. Abstracted storage layer ensures safe concurrent operations across plugins.
          </p>
        </div>

        {/* Database table summary chips */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
            <TableIcon className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-mono text-teal-400">{tableStats.pems}</span>
            <span className="text-slate-400">t_pems rows</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
            <TableIcon className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-mono text-teal-400">{tableStats.activities}</span>
            <span className="text-slate-400">t_activities rows</span>
          </div>
        </div>
      </div>

      {/* Preset Queries Bar */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Preset Analytical Queries
        </label>
        <div className="flex flex-wrap gap-2">
          {PRESET_QUERIES.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => {
                setSql(preset.sql);
                handleRunQuery(preset.sql);
              }}
              className="px-2.5 py-1 text-xs rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors border border-slate-800 whitespace-nowrap"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      {/* Query Editor Box */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1 font-mono">
            <Code2 className="w-3.5 h-3.5 text-teal-400" />
            <span>SQL Statement</span>
          </span>
          <span className="text-slate-500">Press Cmd+Enter or Ctrl+Enter to run</span>
        </div>

        <div className="relative rounded-lg border border-slate-800 bg-slate-950 shadow-inner overflow-hidden focus-within:border-teal-500/50 transition-colors">
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={5}
            placeholder="SELECT * FROM t_pems WHERE fatigue > 5;"
            className="w-full bg-transparent p-3.5 font-mono text-xs text-emerald-300 placeholder-slate-600 focus:outline-none resize-y selection:bg-teal-500/30 selection:text-white"
            spellCheck={false}
          />
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRunQuery()}
              disabled={isRunning || !sql.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-medium text-xs transition-colors shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isRunning ? 'Executing...' : 'Run Query'}</span>
            </button>
            <button
              onClick={() => setSql('')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs transition-colors border border-slate-800"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>

          {result && (
            <div className="flex items-center gap-2">
              <button
                onClick={exportCsv}
                disabled={result.values.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 text-xs transition-colors border border-slate-800"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
              <button
                onClick={copyAsJson}
                disabled={result.values.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-slate-300 text-xs transition-colors border border-slate-800"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied JSON' : 'Copy JSON'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-lg bg-red-950/40 border border-red-800/60 p-4 text-xs text-red-300 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-red-200">Execution Error</p>
            <p className="font-mono text-red-400">{error}</p>
          </div>
        </div>
      )}

      {/* Results Section */}
      {result && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/60 pb-2">
            <div className="flex items-center gap-3">
              <span className="font-medium text-slate-300">Query Results</span>
              <span>·</span>
              <span className="tabular-nums font-mono text-teal-400">
                {result.values.length} {result.values.length === 1 ? 'row' : 'rows'}
              </span>
              {result.rowsAffected !== undefined && (
                <>
                  <span>·</span>
                  <span className="tabular-nums font-mono text-amber-400">
                    {result.rowsAffected} affected
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1 text-slate-500 font-mono">
              <Clock className="w-3 h-3 text-slate-500" />
              <span className="tabular-nums">{result.executionTimeMs}ms</span>
            </div>
          </div>

          {result.columns.length === 0 ? (
            <div className="rounded-lg bg-slate-900/40 border border-slate-800 p-8 text-center text-xs text-slate-500">
              Statement executed successfully with no returned rows.
            </div>
          ) : (
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden shadow-sm">
              <div className="overflow-x-auto max-h-[440px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-950/90 text-slate-400 uppercase font-mono tracking-wider sticky top-0 border-b border-slate-800 z-10">
                    <tr>
                      <th className="py-2.5 px-3 border-r border-slate-800/60 text-slate-500 w-10 text-center">
                        #
                      </th>
                      {result.columns.map((col, idx) => (
                        <th
                          key={idx}
                          className="py-2.5 px-3 border-r border-slate-800/60 last:border-r-0 whitespace-nowrap text-teal-300"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50 font-mono">
                    {result.values.map((row, rowIdx) => (
                      <tr
                        key={rowIdx}
                        className="hover:bg-teal-500/[0.04] transition-colors odd:bg-slate-900/20"
                      >
                        <td className="py-2 px-3 border-r border-slate-800/40 text-slate-600 text-center tabular-nums text-[11px]">
                          {rowIdx + 1}
                        </td>
                        {row.map((val, cellIdx) => (
                          <td
                            key={cellIdx}
                            className="py-2 px-3 border-r border-slate-800/40 last:border-r-0 whitespace-nowrap tabular-nums text-slate-200"
                          >
                            {val === null || val === undefined ? (
                              <span className="text-slate-600 italic font-sans">NULL</span>
                            ) : typeof val === 'number' ? (
                              <span className="text-sky-300">{val}</span>
                            ) : (
                              String(val)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const sqlConsolePlugin: Plugin = {
  metadata: {
    id: 'sql-console',
    name: 'SQL Query Console',
    version: '1.0.0',
    author: 'PEM Tracker Team',
    description: 'Allows interactive SQL queries to be executed directly against the active SQLite database with performance profiling.',
    icon: 'Database',
  },
  initialize(context: PluginContext) {
    // 1. Register Navigation Item
    context.registerNavItem({
      id: 'sql-console',
      label: 'SQL Console',
      icon: 'Database',
      viewId: 'sql-console',
      order: 20,
    });

    // 2. Register Menu Item
    context.registerMenuItem({
      id: 'menu-sql-console',
      label: 'SQL Query Console & Inspector',
      icon: 'Database',
      action: () => context.navigateTo('sql-console'),
      order: 20,
    });

    // 3. Register Full View
    context.registerView({
      id: 'sql-console',
      title: 'SQL Query Console',
      component: SQLConsoleView,
    });
  },
};

export default sqlConsolePlugin;
