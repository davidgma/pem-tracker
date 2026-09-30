/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Plugin, PluginContext } from '../plugin.types';
import { QueryExecutionResult, SqlQueryRecord } from '../../types/database.types';
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
  Sparkles,
  Plus,
  Pencil,
  Trash2,
  Save,
  Tag,
  X,
  RotateCw,
  FolderOpen,
  Bookmark,
  Maximize2,
} from 'lucide-react';
import { format as formatSql } from 'sql-formatter';
import { SqlIdeView, IdeInitialState, IdeReturnPayload } from './SqlIdeView';

/**
 * Prettify and format SQL statements with uppercase keywords and standardized indentation
 */
export function prettifySql(rawSql: string): string {
  if (!rawSql || !rawSql.trim()) return rawSql;
  try {
    return formatSql(rawSql, {
      language: 'sqlite',
      keywordCase: 'upper',
      tabWidth: 2,
    });
  } catch (e) {
    console.warn('SQL formatting notice:', e);
    return rawSql;
  }
}

const SQL_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE',
  'CREATE', 'TABLE', 'DROP', 'ALTER', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
  'ON', 'GROUP', 'BY', 'ORDER', 'ASC', 'DESC', 'LIMIT', 'OFFSET', 'AND', 'OR',
  'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'AS', 'HAVING', 'UNION', 'ALL', 'DISTINCT',
  'BETWEEN', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'PRAGMA',
]);

const SQL_FUNCTIONS = new Set([
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'DATE', 'DATETIME', 'STRFTIME',
  'COALESCE', 'TOTAL', 'UPPER', 'LOWER', 'LENGTH', 'ABS', 'TABLE_INFO',
]);

/**
 * Real-time SQL Syntax Highlighting Renderer
 */
function renderSqlHighlighted(code: string): React.ReactNode[] {
  if (!code) return [];

  // Regex to match tokens: comments, strings, words/identifiers, numbers, operators
  const tokenRegex = /(--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|\b[A-Za-z_][A-Za-z0-9_]*\b|\b\d+(?:\.\d+)?\b|[(),;=<>!+\-*/])/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(code)) !== null) {
    // Plain text before token
    if (match.index > lastIndex) {
      elements.push(code.substring(lastIndex, match.index));
    }

    const token = match[0];
    const upper = token.toUpperCase();

    if (token.startsWith('--') || token.startsWith('/*')) {
      // Comment (slate italic)
      elements.push(
        <span key={match.index} className="text-slate-400 italic">
          {token}
        </span>
      );
    } else if (token.startsWith("'") || token.startsWith('"')) {
      // String literal (emerald green)
      elements.push(
        <span key={match.index} className="text-emerald-700 font-medium">
          {token}
        </span>
      );
    } else if (SQL_KEYWORDS.has(upper)) {
      // Keyword (indigo bold)
      elements.push(
        <span key={match.index} className="text-indigo-600 font-bold">
          {token}
        </span>
      );
    } else if (SQL_FUNCTIONS.has(upper)) {
      // Function (purple)
      elements.push(
        <span key={match.index} className="text-purple-600 font-semibold">
          {token}
        </span>
      );
    } else if (/^\d+(\.\d+)?$/.test(token)) {
      // Number (amber)
      elements.push(
        <span key={match.index} className="text-amber-700 font-medium">
          {token}
        </span>
      );
    } else if (/[(),;=<>!+\-*/]/.test(token)) {
      // Operator / punctuation (rose)
      elements.push(
        <span key={match.index} className="text-rose-600 font-medium">
          {token}
        </span>
      );
    } else {
      // Default identifier / column / table name (dark slate)
      elements.push(
        <span key={match.index} className="text-slate-800">
          {token}
        </span>
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  // Trailing text
  if (lastIndex < code.length) {
    elements.push(code.substring(lastIndex));
  }

  return elements;
}

/**
 * Synchronized Syntax Highlighted Textarea Editor
 */
const SqlSyntaxEditor: React.FC<{
  value: string;
  onChange: (val: string) => void;
  onRun?: () => void;
  disabled?: boolean;
  minHeightClass?: string;
  placeholder?: string;
  showPrettify?: boolean;
  onOpenIde?: () => void;
}> = ({
  value,
  onChange,
  onRun,
  disabled,
  minHeightClass = 'min-h-[140px] sm:min-h-[160px]',
  placeholder = 'Enter SQL statement here (e.g. SELECT * FROM t_activities;)',
  showPrettify = true,
  onOpenIde,
}) => {
  const preRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.currentTarget.scrollTop;
      preRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && onRun) {
      e.preventDefault();
      onRun();
    }
  };

  const handlePrettify = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!value.trim()) return;
    const formatted = prettifySql(value);
    onChange(formatted);
  };

  const highlightedNodes = useMemo(() => {
    return renderSqlHighlighted(value);
  }, [value]);

  return (
    <div className="relative rounded-xl border border-slate-300 bg-white font-mono text-sm shadow-sm overflow-hidden focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-100 transition-all group">
      {/* Corner Quick Actions */}
      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
        {onOpenIde && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenIde();
            }}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/95 hover:bg-slate-100 text-slate-700 hover:text-teal-700 border border-slate-200/90 shadow-xs text-[11px] font-sans font-medium transition-all backdrop-blur-xs cursor-pointer"
            title="Open in full-page IDE editing mode"
          >
            <Maximize2 className="w-3 h-3 text-teal-600" />
            <span>Full IDE</span>
          </button>
        )}
        {showPrettify && (
          <button
            type="button"
            onClick={handlePrettify}
            disabled={disabled || !value.trim()}
            className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/95 hover:bg-slate-100 text-slate-600 hover:text-teal-700 border border-slate-200/90 shadow-xs text-[11px] font-sans font-medium transition-all backdrop-blur-xs disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="Prettify & Format SQL statement"
          >
            <Sparkles className="w-3 h-3 text-teal-600" />
            <span>Prettify</span>
          </button>
        )}
      </div>

      {/* Syntax Highlighted Mirror (Absolute background) */}
      <pre
        ref={preRef}
        aria-hidden="true"
        className={`absolute inset-0 p-3.5 pointer-events-none whitespace-pre-wrap break-words leading-relaxed font-mono text-sm overflow-auto text-slate-800 select-none ${minHeightClass}`}
      >
        {highlightedNodes}
        {/* Trailing newline spacer so scroll height matches textarea */}
        {value.endsWith('\n') ? ' ' : ''}
      </pre>

      {/* Transparent Input Textarea (Foreground with visible caret) */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={false}
        className={`relative block w-full p-3.5 bg-transparent text-transparent caret-slate-900 resize-y whitespace-pre-wrap break-words leading-relaxed font-mono text-sm outline-none overflow-auto z-10 selection:bg-teal-100 selection:text-transparent ${minHeightClass}`}
      />
    </div>
  );
};

const SQLConsoleView: React.FC<{ context: PluginContext }> = ({ context }) => {
  const [savedQueries, setSavedQueries] = useState<SqlQueryRecord[]>([]);
  const [selectedQueryId, setSelectedQueryId] = useState<number | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [sql, setSql] = useState<string>(
    'SELECT id, pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog FROM t_pems ORDER BY pem_date DESC LIMIT 15;'
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<QueryExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState<boolean>(false);
  const [newCategoryInput, setNewCategoryInput] = useState<string>('');
  const [modalForm, setModalForm] = useState<{
    id?: number;
    name: string;
    description: string;
    category: string;
    sql_text: string;
  }>({
    name: '',
    description: '',
    category: 'Custom',
    sql_text: '',
  });
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

  const loadQueries = async (autoSelectFirst = false) => {
    try {
      const list = await context.database.getSavedQueries();
      setSavedQueries(list);
      if (autoSelectFirst && list.length > 0) {
        setSelectedQueryId(list[0].id);
        setSql(list[0].sql_text);
        handleRunQuery(list[0].sql_text);
      }
    } catch (e) {
      console.error('Failed to load queries from t_sql_queries:', e);
    }
  };

  useEffect(() => {
    refreshTableStats();
    loadQueries(true);
  }, []);

  const handleSelectQuery = (q: SqlQueryRecord) => {
    setSelectedQueryId(q.id);
    setSql(q.sql_text);
    handleRunQuery(q.sql_text);
  };

  const existingCategories = useMemo(() => {
    const cats = new Set<string>();
    savedQueries.forEach((q) => {
      if (q.category && q.category.trim()) cats.add(q.category.trim());
    });
    if (cats.size === 0) {
      ['PEM Tracking', 'Activities', 'Rollups', 'Analysis', 'Schema', 'Settings', 'Custom'].forEach(
        (c) => cats.add(c)
      );
    }
    return Array.from(cats).sort();
  }, [savedQueries]);

  const handleOpenCreateModal = () => {
    const defaultCat =
      activeCategory !== 'All' ? activeCategory : existingCategories[0] || 'Custom';
    setModalForm({
      id: undefined,
      name: '',
      description: '',
      category: defaultCat,
      sql_text: sql || '',
    });
    setIsCreatingCategory(false);
    setNewCategoryInput('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (q: SqlQueryRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    const isKnown = existingCategories.includes(q.category || '');
    setModalForm({
      id: q.id,
      name: q.name,
      description: q.description || '',
      category: q.category || 'General',
      sql_text: q.sql_text,
    });
    if (!isKnown && q.category) {
      setIsCreatingCategory(true);
      setNewCategoryInput(q.category);
    } else {
      setIsCreatingCategory(false);
      setNewCategoryInput('');
    }
    setIsModalOpen(true);
  };

  const handlePrettifyMainSql = () => {
    if (!sql.trim()) return;
    setSql(prettifySql(sql));
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalForm.name.trim() || !modalForm.sql_text.trim()) {
      context.showNotification('Validation Error', 'Query name and SQL text are required', 'warning');
      return;
    }

    try {
      const savedId = await context.database.saveQuery({
        id: modalForm.id,
        name: modalForm.name.trim(),
        description: modalForm.description.trim(),
        category: modalForm.category.trim() || 'Custom',
        sql_text: modalForm.sql_text.trim(),
      });

      await loadQueries();
      setSelectedQueryId(savedId);
      setIsModalOpen(false);
      context.showNotification(
        modalForm.id ? 'Query Updated' : 'Query Created',
        `Successfully maintained in t_sql_queries table`,
        'success'
      );
    } catch (err: any) {
      context.showNotification('Save Error', err.message || 'Failed to save query', 'error');
    }
  };

  const handleDeleteQuery = async (q: SqlQueryRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete query "${q.name}" from t_sql_queries?`)) return;

    try {
      await context.database.deleteQuery(q.id);
      await loadQueries();
      if (selectedQueryId === q.id) {
        setSelectedQueryId(null);
      }
      context.showNotification('Query Deleted', `Removed "${q.name}" from t_sql_queries`, 'info');
    } catch (err: any) {
      context.showNotification('Delete Error', err.message || 'Failed to delete query', 'error');
    }
  };

  const handleResetDefaults = async () => {
    if (
      !confirm(
        'Reset all queries in t_sql_queries to preset defaults? Custom queries will be replaced with defaults.'
      )
    )
      return;

    try {
      await context.database.resetDefaultQueries();
      await loadQueries(true);
      context.showNotification('Presets Restored', 'Reset t_sql_queries to initial preset queries', 'success');
    } catch (err: any) {
      context.showNotification('Reset Error', err.message || 'Failed to reset queries', 'error');
    }
  };

  const categories = useMemo(() => {
    const cats = new Set<string>();
    savedQueries.forEach((q) => {
      if (q.category) cats.add(q.category);
    });
    return ['All', ...Array.from(cats)];
  }, [savedQueries]);

  const filteredQueries = useMemo(() => {
    if (activeCategory === 'All') return savedQueries;
    return savedQueries.filter((q) => q.category === activeCategory);
  }, [savedQueries, activeCategory]);

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
    const jsonObjects = result.values.map((row) => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });

    navigator.clipboard.writeText(JSON.stringify(jsonObjects, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto py-2">
      {/* Header & Table Counts */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Database className="w-5 h-5 text-teal-600" />
            <span>SQLite3 Query Console</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Execute SQL queries directly against the in-browser thread-safe SQLite database with live syntax highlighting.
          </p>
        </div>

        {/* Live Database Status Pill */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm text-slate-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>
              <strong className="font-mono text-slate-900">{tableStats.pems}</strong> PEM logs
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 shadow-sm text-slate-700">
            <span className="w-2 h-2 rounded-full bg-teal-500"></span>
            <span>
              <strong className="font-mono text-slate-900">{tableStats.activities}</strong> activities
            </span>
          </div>
        </div>
      </div>

      {/* Saved & Preset Queries from t_sql_queries */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-teal-600" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Saved Queries (<code className="font-mono text-teal-700 bg-teal-50 px-1 py-0.5 rounded border border-teal-200 lowercase">t_sql_queries</code>)
            </span>
            <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {savedQueries.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs transition-colors shadow-xs"
              title="Save new query into t_sql_queries"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Query</span>
            </button>

            <button
              onClick={handleResetDefaults}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-medium transition-colors"
              title="Reset t_sql_queries table to preset defaults"
            >
              <RotateCw className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Reset Presets</span>
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        {categories.length > 2 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  activeCategory === cat
                    ? 'bg-teal-50 text-teal-800 border border-teal-200 font-semibold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 border border-transparent'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Queries Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
          {filteredQueries.map((q) => {
            const isSelected = selectedQueryId === q.id;
            return (
              <div
                key={q.id}
                onClick={() => handleSelectQuery(q)}
                className={`group relative flex flex-col justify-between p-3 rounded-lg border text-left cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-teal-50/70 border-teal-400 ring-1 ring-teal-400 shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-semibold text-xs text-slate-900 group-hover:text-teal-700 transition-colors truncate">
                      {q.name}
                    </span>
                    {q.category && (
                      <span className="shrink-0 text-[10px] font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        {q.category}
                      </span>
                    )}
                  </div>
                  {q.description && (
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{q.description}</p>
                  )}
                </div>

                <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-slate-100 text-[11px]">
                  <span className="font-mono text-slate-400 truncate max-w-[150px]">
                    {q.sql_text.replace(/\s+/g, ' ').substring(0, 32)}...
                  </span>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => handleOpenEditModal(q, e)}
                      className="p-1.5 rounded text-slate-400 hover:text-teal-700 hover:bg-teal-50 transition-colors"
                      title="Edit query in t_sql_queries"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteQuery(q, e)}
                      className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title="Delete from t_sql_queries"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* SQL Editor with Real-Time Syntax Highlighting */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-medium flex items-center gap-1.5 text-slate-700">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>SQL Statement Editor</span>
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrettifyMainSql}
              disabled={isRunning || !sql.trim()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors disabled:opacity-40"
              title="Prettify & format SQL with uppercase keywords and indentation"
            >
              <Sparkles className="w-3 h-3 text-teal-600" />
              <span>Prettify SQL</span>
            </button>
            <span className="hidden sm:inline text-slate-400">Press <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px] text-slate-600">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 font-mono text-[10px] text-slate-600">Enter</kbd> to execute</span>
          </div>
        </div>

        {/* Real-Time Syntax Highlighted Editor */}
        <SqlSyntaxEditor
          value={sql}
          onChange={(newVal) => setSql(newVal)}
          onRun={() => handleRunQuery()}
          disabled={isRunning}
        />

        {/* Action Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleRunQuery()}
              disabled={isRunning || !sql.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-medium text-xs sm:text-sm transition-colors shadow-sm min-h-[42px]"
            >
              {isRunning ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Executing...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Execute SQL</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handlePrettifyMainSql}
              disabled={isRunning || !sql.trim()}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors shadow-sm min-h-[42px] disabled:opacity-40"
              title="Prettify and format SQL query"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-600" />
              <span>Prettify SQL</span>
            </button>

            <button
              onClick={() => setSql('')}
              className="px-3.5 py-2.5 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 transition-colors shadow-sm min-h-[42px]"
              title="Clear editor"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handleOpenCreateModal}
              disabled={!sql.trim()}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 transition-colors shadow-sm min-h-[42px]"
              title="Save current SQL to t_sql_queries table"
            >
              <Save className="w-3.5 h-3.5 text-teal-600" />
              <span>Save Query</span>
            </button>
          </div>

          {result && (
            <div className="flex items-center gap-2">
              <button
                onClick={copyAsJson}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-colors shadow-sm min-h-[40px]"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied JSON' : 'Copy JSON'}</span>
              </button>

              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-colors shadow-sm min-h-[40px]"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-start gap-3 shadow-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-rose-900">Execution Error</p>
            <p className="font-mono text-rose-700 break-all">{error}</p>
          </div>
        </div>
      )}

      {/* Results Section */}
      {result && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm space-y-0">
          {/* Query Stats Banner */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs">
            <div className="flex items-center gap-2 text-slate-700">
              <TableIcon className="w-4 h-4 text-teal-600" />
              <span>
                <strong>{result.values.length}</strong> {result.values.length === 1 ? 'row' : 'rows'} returned
              </span>
              {(result.rowsAffected ?? 0) > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-teal-700 font-medium">
                    {result.rowsAffected} {result.rowsAffected === 1 ? 'row' : 'rows'} affected
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-slate-500 font-mono">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{result.executionTimeMs.toFixed(2)} ms</span>
            </div>
          </div>

          {/* Results Table */}
          {result.columns.length > 0 ? (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse font-sans">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 font-semibold border-b border-slate-200 z-10">
                  <tr>
                    <th className="py-2.5 px-3 text-[11px] font-mono text-slate-500 w-12 text-center border-r border-slate-200">
                      #
                    </th>
                    {result.columns.map((col, idx) => (
                      <th
                        key={idx}
                        className="py-2.5 px-3.5 font-mono text-slate-800 tracking-wider whitespace-nowrap border-r border-slate-200 last:border-r-0"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {result.values.length === 0 ? (
                    <tr>
                      <td
                        colSpan={result.columns.length + 1}
                        className="py-8 text-center text-slate-400 italic text-xs"
                      >
                        Query executed successfully. 0 rows returned.
                      </td>
                    </tr>
                  ) : (
                    result.values.map((row, rIdx) => (
                      <tr
                        key={rIdx}
                        className="hover:bg-slate-50/80 transition-colors font-mono"
                      >
                        <td className="py-2 px-3 text-[11px] text-slate-400 text-center border-r border-slate-100">
                          {rIdx + 1}
                        </td>
                        {row.map((val, cIdx) => (
                          <td
                            key={cIdx}
                            className="py-2 px-3.5 whitespace-nowrap border-r border-slate-100 last:border-r-0 text-slate-800"
                          >
                            {val === null || val === undefined ? (
                              <span className="text-slate-400 italic font-mono text-[11px]">NULL</span>
                            ) : typeof val === 'number' ? (
                              <span className="tabular-nums text-indigo-700 font-medium">{val}</span>
                            ) : (
                              String(val)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 text-xs">
              Statement executed successfully with no result set.
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Query Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Bookmark className="w-4 h-4 text-teal-600" />
                <h3 className="font-bold text-sm text-slate-900">
                  {modalForm.id ? 'Edit Query in t_sql_queries' : 'Save Query to t_sql_queries'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Query Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Weekly Step Averages"
                  value={modalForm.name}
                  onChange={(e) => setModalForm({ ...modalForm, name: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      Category *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const nextState = !isCreatingCategory;
                        setIsCreatingCategory(nextState);
                        if (!nextState) {
                          setModalForm({
                            ...modalForm,
                            category: existingCategories[0] || 'Custom',
                          });
                        } else {
                          setNewCategoryInput('');
                        }
                      }}
                      className="text-[11px] font-medium text-teal-600 hover:text-teal-700 hover:underline flex items-center gap-0.5"
                    >
                      {isCreatingCategory ? (
                        <span>Pick existing</span>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          <span>New category</span>
                        </>
                      )}
                    </button>
                  </div>

                  {isCreatingCategory ? (
                    <input
                      type="text"
                      autoFocus
                      required
                      placeholder="e.g. Vitals, Nutrition, Labs"
                      value={newCategoryInput}
                      onChange={(e) => {
                        setNewCategoryInput(e.target.value);
                        setModalForm({ ...modalForm, category: e.target.value });
                      }}
                      className="w-full bg-white border border-teal-500 ring-1 ring-teal-500 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none"
                    />
                  ) : (
                    <select
                      value={modalForm.category}
                      onChange={(e) => {
                        if (e.target.value === '__CREATE_NEW__') {
                          setIsCreatingCategory(true);
                          setNewCategoryInput('');
                        } else {
                          setModalForm({ ...modalForm, category: e.target.value });
                        }
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                    >
                      {existingCategories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="__CREATE_NEW__">+ Create new category...</option>
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Brief description of what this query does"
                    value={modalForm.description}
                    onChange={(e) => setModalForm({ ...modalForm, description: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    SQL Statement *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const formatted = prettifySql(modalForm.sql_text);
                      setModalForm({ ...modalForm, sql_text: formatted });
                    }}
                    disabled={!modalForm.sql_text.trim()}
                    className="flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 transition-colors disabled:opacity-40"
                    title="Prettify & format SQL with uppercase keywords and indentation"
                  >
                    <Sparkles className="w-3 h-3 text-teal-600" />
                    <span>Prettify SQL</span>
                  </button>
                </div>

                {/* Real-time Syntax Highlighted Editor inside Modal */}
                <SqlSyntaxEditor
                  value={modalForm.sql_text}
                  onChange={(val) => setModalForm({ ...modalForm, sql_text: val })}
                  placeholder="SELECT * FROM t_pems;"
                  minHeightClass="min-h-[160px]"
                />
              </div>

              <div className="text-[11px] text-slate-500">
                This query will be stored in <code className="font-mono text-teal-700 bg-teal-50 px-1 py-0.5 rounded">t_sql_queries</code> and maintained across sessions and cloud sync.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors shadow-xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{modalForm.id ? 'Update Query' : 'Save to t_sql_queries'}</span>
                </button>
              </div>
            </form>
          </div>
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
    description: 'Execute arbitrary SQL statements directly against SQLite with real-time syntax highlighting, profiling stats, and exports.',
    icon: 'Database',
  },
  initialize(context: PluginContext) {
    // 1. Register Top Navigation Bar Link
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
      label: 'SQL Query Console',
      icon: 'Database',
      action: () => context.navigateTo('sql-console'),
      order: 20,
    });

    // 3. Register Dedicated View
    context.registerView({
      id: 'sql-console',
      title: 'SQL Query Console',
      component: SQLConsoleView,
    });
  },
};

export default sqlConsolePlugin;
