/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Editor, { Monaco, OnMount } from '@monaco-editor/react';
import {
  Code2,
  Maximize2,
  Minimize2,
  Play,
  Sparkles,
  Save,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Database,
  Table as TableIcon,
  Key,
  HelpCircle,
  Download,
  Copy,
  RotateCcw,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  Plus,
  Search,
  ArrowLeft,
  Pencil,
  Terminal,
  AlertCircle,
  Layers,
  ChevronUp,
  Tag,
  BookOpen,
} from 'lucide-react';
import { PluginContext } from '../plugin.types';
import {
  QueryExecutionResult,
  SqlQueryRecord,
  TableSchemaInfo,
} from '../../types/database.types';
import { prettifySql } from './index';

export interface IdeInitialState {
  source: 'console' | 'editor' | 'modal' | 'query_item';
  queryId?: number;
  queryName?: string;
  category?: string;
  description?: string;
  sql: string;
}

export interface IdeReturnPayload {
  saved: boolean;
  queryId?: number;
  queryName?: string;
  category?: string;
  description?: string;
  sql: string;
}

interface SqlIdeViewProps {
  context: PluginContext;
  initialState: IdeInitialState;
  onExit: (payload: IdeReturnPayload) => void;
}

export const SqlIdeView: React.FC<SqlIdeViewProps> = ({
  context,
  initialState,
  onExit,
}) => {
  // Active Query Metadata
  const [currentQueryId, setCurrentQueryId] = useState<number | undefined>(
    initialState.queryId
  );
  const [queryName, setQueryName] = useState<string>(
    initialState.queryName || (initialState.queryId ? 'Saved Query' : '')
  );
  const [category, setCategory] = useState<string>(
    initialState.category || 'General'
  );
  const [description, setDescription] = useState<string>(
    initialState.description || ''
  );
  const [sqlCode, setSqlCode] = useState<string>(initialState.sql || '');
  const [isDirty, setIsDirty] = useState<boolean>(false);

  // Queries catalog
  const [savedQueries, setSavedQueries] = useState<SqlQueryRecord[]>([]);
  const [isQueryMenuOpen, setIsQueryMenuOpen] = useState<boolean>(false);
  const [queryFilterText, setQueryFilterText] = useState<string>('');

  // Metadata Edit Modal
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState<boolean>(false);
  const [editNameInput, setEditNameInput] = useState<string>('');
  const [editCategoryInput, setEditCategoryInput] = useState<string>('');
  const [editDescInput, setEditDescInput] = useState<string>('');
  const [isCustomCategory, setIsCustomCategory] = useState<boolean>(false);

  // Schema Explorer State
  const [schemaTables, setSchemaTables] = useState<TableSchemaInfo[]>([]);
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({
    t_pems: true,
    t_activities: true,
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [schemaSearch, setSchemaSearch] = useState<string>('');

  // Editor State
  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark');
  const [showMinimap, setShowMinimap] = useState<boolean>(true);
  const [editorCursorPos, setEditorCursorPos] = useState<{ line: number; col: number }>({
    line: 1,
    col: 1,
  });
  const [selectedCharCount, setSelectedCharCount] = useState<number>(0);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);

  // Execution & Results State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [result, setResult] = useState<QueryExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeBottomTab, setActiveBottomTab] = useState<'results' | 'help'>('results');
  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState<boolean>(true);
  const [copiedResults, setCopiedResults] = useState<boolean>(false);

  // Exit Confirmation Dialog
  const [showExitConfirm, setShowExitConfirm] = useState<boolean>(false);

  // Load Saved Queries
  const refreshSavedQueries = async () => {
    try {
      const list = await context.database.getSavedQueries();
      setSavedQueries(list);
    } catch (e) {
      console.error('Failed to load saved queries:', e);
    }
  };

  // Load Database Schema
  const refreshSchema = async () => {
    try {
      const tables = await context.database.getDatabaseSchema();
      setSchemaTables(tables);
    } catch (e) {
      console.error('Failed to load database schema:', e);
    }
  };

  useEffect(() => {
    refreshSavedQueries();
    refreshSchema();
  }, []);

  // Compute existing categories for dropdown
  const existingCategories = useMemo(() => {
    const set = new Set<string>();
    savedQueries.forEach((q) => {
      if (q.category?.trim()) set.add(q.category.trim());
    });
    if (set.size === 0) {
      ['PEM Tracking', 'Activities', 'Rollups', 'Analysis', 'Schema', 'Settings', 'Custom'].forEach(
        (c) => set.add(c)
      );
    }
    return Array.from(set).sort();
  }, [savedQueries]);

  // Autocomplete / IntelliSense registration
  const setupIntelliSense = useCallback(
    (monaco: Monaco) => {
      // Register custom SQLite schema completion provider
      return monaco.languages.registerCompletionItemProvider('sql', {
        provideCompletionItems: (model, position) => {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions: any[] = [];

          // 1. Table suggestions
          schemaTables.forEach((table) => {
            suggestions.push({
              label: table.name,
              kind: monaco.languages.CompletionItemKind.Class,
              insertText: table.name,
              detail: `Table (${table.rowCount} rows)`,
              documentation: `SQLite Table ${table.name}\nColumns: ${table.columns
                .map((c) => `${c.name} (${c.type})`)
                .join(', ')}`,
              range,
            });

            // 2. Column suggestions
            table.columns.forEach((col) => {
              suggestions.push({
                label: col.name,
                kind: monaco.languages.CompletionItemKind.Field,
                insertText: col.name,
                detail: `${col.type} in ${table.name}${col.pk ? ' (PK)' : ''}`,
                documentation: `Column of ${table.name}. Type: ${col.type}. NotNull: ${
                  col.notnull ? 'Yes' : 'No'
                }${col.pk ? ' [Primary Key]' : ''}`,
                range,
              });
            });
          });

          // 3. Common SQLite Keywords & Snippets
          const sqliteKeywords = [
            'SELECT',
            'FROM',
            'WHERE',
            'GROUP BY',
            'ORDER BY',
            'DESC',
            'ASC',
            'LIMIT',
            'OFFSET',
            'JOIN',
            'LEFT JOIN',
            'INNER JOIN',
            'INSERT INTO',
            'VALUES',
            'UPDATE',
            'SET',
            'DELETE',
            'CREATE TABLE',
            'DROP TABLE',
            'COUNT(*)',
            'SUM',
            'AVG',
            'ROUND',
            'COALESCE',
            'STRFTIME',
            'DATE',
            'DATETIME',
            'PRAGMA',
          ];

          sqliteKeywords.forEach((kw) => {
            suggestions.push({
              label: kw,
              kind: monaco.languages.CompletionItemKind.Keyword,
              insertText: kw,
              detail: 'SQLite Keyword / Function',
              range,
            });
          });

          // 4. Useful Snippets
          suggestions.push(
            {
              label: 'snippet-pems',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText:
                'SELECT id, pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog\nFROM t_pems\nORDER BY pem_date DESC\nLIMIT 20;',
              detail: 'Query recent PEM crash episodes',
              range,
            },
            {
              label: 'snippet-activities',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText:
                'SELECT activity_date, activity_name, duration, (end_steps - start_steps) AS delta_steps, (end_calories - start_calories) AS delta_cals, (end_moderate - start_moderate) AS delta_mod\nFROM t_activities\nORDER BY activity_date DESC\nLIMIT 20;',
              detail: 'Query recent exertion activities with metric deltas',
              range,
            },
            {
              label: 'snippet-pem-activity-correlation',
              kind: monaco.languages.CompletionItemKind.Snippet,
              insertText:
                'SELECT \n  p.pem_date,\n  p.fatigue,\n  p.brain_fog,\n  a.activity_date,\n  a.activity_name,\n  (a.end_steps - a.start_steps) AS steps,\n  (a.end_calories - a.start_calories) AS calories\nFROM t_pems p\nLEFT JOIN t_activities a \n  ON date(a.activity_date) >= date(p.pem_date, \'-2 days\') \n AND date(a.activity_date) <= date(p.pem_date)\nORDER BY p.pem_date DESC;',
              detail: 'Correlate PEM crashes with activities 24-48h prior',
              range,
            }
          );

          return { suggestions };
        },
      });
    },
    [schemaTables]
  );

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register completion provider
    const completionDisposable = setupIntelliSense(monaco);

    // Track cursor and selection changes
    editor.onDidChangeCursorPosition((e) => {
      setEditorCursorPos({ line: e.position.lineNumber, col: e.position.column });
      const sel = editor.getSelection();
      if (sel && !sel.isEmpty()) {
        const text = editor.getModel()?.getValueInRange(sel) || '';
        setSelectedCharCount(text.length);
      } else {
        setSelectedCharCount(0);
      }
    });

    // Add Keyboard Shortcuts directly in Monaco
    // Ctrl+Enter or Cmd+Enter => Run Query
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      handleRunQuery();
    });

    // Ctrl+S or Cmd+S => Save Query
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSaveQuery(false);
    });

    // Shift+Alt+F => Format / Prettify SQL
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => {
      handlePrettify();
    });

    // Clean up
    return () => {
      completionDisposable.dispose();
    };
  };

  // Re-register provider when schema tables change
  useEffect(() => {
    if (monacoRef.current) {
      setupIntelliSense(monacoRef.current);
    }
  }, [schemaTables, setupIntelliSense]);

  // Insert text into editor at current cursor position
  const insertTextIntoEditor = (textToInsert: string) => {
    if (!editorRef.current) {
      setSqlCode((prev) => prev + textToInsert);
      return;
    }
    const editor = editorRef.current;
    const position = editor.getPosition();
    editor.executeEdits('insert-helper', [
      {
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
        text: textToInsert,
        forceMoveMarkers: true,
      },
    ]);
    editor.focus();
    setIsDirty(true);
  };

  // Prettify SQL Statement
  const handlePrettify = () => {
    if (!sqlCode.trim()) return;
    const formatted = prettifySql(sqlCode);
    setSqlCode(formatted);
    if (editorRef.current) {
      editorRef.current.setValue(formatted);
    }
    setIsDirty(true);
  };

  // Run Query or Selected SQL
  const handleRunQuery = async () => {
    let targetSql = sqlCode.trim();

    // Check if user has text selected in Monaco
    if (editorRef.current) {
      const selection = editorRef.current.getSelection();
      if (selection && !selection.isEmpty()) {
        const selectedText = editorRef.current.getModel()?.getValueInRange(selection);
        if (selectedText && selectedText.trim()) {
          targetSql = selectedText.trim();
        }
      }
    }

    if (!targetSql) {
      context.showNotification('Empty Query', 'Enter or select a SQL statement to execute', 'warning');
      return;
    }

    setIsRunning(true);
    setError(null);
    setActiveBottomTab('results');
    setIsBottomPanelOpen(true);

    try {
      const res = await context.database.executeRawWithStats(targetSql);
      setResult(res);
      // Refresh schema if DDL was executed
      if (/create|drop|alter|insert|delete|update/i.test(targetSql)) {
        refreshSchema();
      }
    } catch (err: any) {
      console.error('IDE SQL Error:', err);
      setError(err?.message || 'Execution error encountered');
      setResult(null);
    } finally {
      setIsRunning(false);
    }
  };

  // Save Query to t_sql_queries
  const handleSaveQuery = async (exitAfter = false): Promise<boolean> => {
    const finalName = queryName.trim() || 'Untitled Query';
    const finalSql = sqlCode.trim();

    if (!finalSql) {
      context.showNotification('Validation Error', 'SQL statement cannot be empty', 'warning');
      return false;
    }

    try {
      const savedId = await context.database.saveQuery({
        id: currentQueryId,
        name: finalName,
        category: category.trim() || 'Custom',
        description: description.trim(),
        sql_text: finalSql,
      });

      setCurrentQueryId(savedId);
      setQueryName(finalName);
      setIsDirty(false);
      await refreshSavedQueries();

      context.showNotification(
        currentQueryId ? 'Query Updated' : 'Query Saved',
        `Maintained "${finalName}" in t_sql_queries`,
        'success'
      );

      if (exitAfter) {
        onExit({
          saved: true,
          queryId: savedId,
          queryName: finalName,
          category,
          description,
          sql: finalSql,
        });
      }
      return true;
    } catch (err: any) {
      context.showNotification('Save Error', err.message || 'Failed to save query', 'error');
      return false;
    }
  };

  // Switch to another saved query from the menu
  const handleSelectQueryFromMenu = (q: SqlQueryRecord) => {
    if (isDirty) {
      if (
        !confirm(
          `You have unsaved edits in "${queryName || 'current query'}". Discard changes and open "${q.name}"?`
        )
      ) {
        return;
      }
    }

    setCurrentQueryId(q.id);
    setQueryName(q.name);
    setCategory(q.category || 'General');
    setDescription(q.description || '');
    setSqlCode(q.sql_text);
    setIsDirty(false);
    setIsQueryMenuOpen(false);

    if (editorRef.current) {
      editorRef.current.setValue(q.sql_text);
    }
  };

  // Start new blank query
  const handleStartNewQuery = () => {
    if (isDirty) {
      if (!confirm('You have unsaved edits. Discard and start a new query?')) {
        return;
      }
    }
    setCurrentQueryId(undefined);
    setQueryName('');
    setCategory('Custom');
    setDescription('');
    setSqlCode('SELECT * FROM t_pems ORDER BY pem_date DESC LIMIT 10;');
    setIsDirty(false);
    setIsQueryMenuOpen(false);

    if (editorRef.current) {
      editorRef.current.setValue('SELECT * FROM t_pems ORDER BY pem_date DESC LIMIT 10;');
    }
  };

  // Open Details Modal to edit Name / Category / Description
  const handleOpenDetailsModal = () => {
    setEditNameInput(queryName);
    setEditCategoryInput(category);
    setEditDescInput(description);
    setIsCustomCategory(!existingCategories.includes(category));
    setIsDetailsModalOpen(true);
  };

  const handleSaveDetails = (e: React.FormEvent) => {
    e.preventDefault();
    setQueryName(editNameInput.trim() || 'Untitled Query');
    setCategory(editCategoryInput.trim() || 'General');
    setDescription(editDescInput.trim());
    setIsDetailsModalOpen(false);
    setIsDirty(true);
  };

  // Handle Exit
  const handleRequestExit = () => {
    if (isDirty) {
      setShowExitConfirm(true);
    } else {
      onExit({
        saved: false,
        queryId: currentQueryId,
        queryName,
        category,
        description,
        sql: sqlCode,
      });
    }
  };

  // Copy Query Results as JSON
  const handleCopyResultsJson = () => {
    if (!result) return;
    const rows = result.values.map((row) => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col, idx) => {
        obj[col] = row[idx];
      });
      return obj;
    });
    navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
    setCopiedResults(true);
    setTimeout(() => setCopiedResults(false), 2000);
  };

  // Download Query Results as CSV
  const handleDownloadCsv = () => {
    if (!result || result.values.length === 0) return;
    const header = result.columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(',');
    const rows = result.values.map((row) =>
      row
        .map((val) => {
          if (val === null || val === undefined) return '""';
          const str = String(val);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(',')
    );
    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${queryName || 'query_results'}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered queries in menu
  const filteredQueries = useMemo(() => {
    if (!queryFilterText.trim()) return savedQueries;
    const lower = queryFilterText.toLowerCase();
    return savedQueries.filter(
      (q) =>
        q.name.toLowerCase().includes(lower) ||
        (q.category && q.category.toLowerCase().includes(lower)) ||
        (q.description && q.description.toLowerCase().includes(lower))
    );
  }, [savedQueries, queryFilterText]);

  // Filtered tables in schema explorer
  const filteredSchemaTables = useMemo(() => {
    if (!schemaSearch.trim()) return schemaTables;
    const lower = schemaSearch.toLowerCase();
    return schemaTables.filter(
      (t) =>
        t.name.toLowerCase().includes(lower) ||
        t.columns.some((c) => c.name.toLowerCase().includes(lower))
    );
  }, [schemaTables, schemaSearch]);

  const toggleTableExpand = (name: string) => {
    setExpandedTables((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  // Title display
  const titleDisplay = queryName.trim() || 'SQL Statement Editor';

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col ${
        theme === 'vs-dark' ? 'bg-[#1e1e1e] text-slate-200' : 'bg-slate-100 text-slate-800'
      } select-none font-sans overflow-hidden`}
    >
      {/* ── Top IDE Header Bar ────────────────────────────────────────────── */}
      <header
        className={`h-12 shrink-0 flex items-center justify-between px-3 border-b ${
          theme === 'vs-dark'
            ? 'bg-[#252526] border-[#333333]'
            : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        {/* Left: Exit/Back + Logo + Query Menu Dropdown */}
        <div className="flex items-center gap-2">
          {/* Back/Exit Button */}
          <button
            type="button"
            onClick={handleRequestExit}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
              theme === 'vs-dark'
                ? 'hover:bg-[#37373d] text-slate-300'
                : 'hover:bg-slate-100 text-slate-700'
            }`}
            title="Exit IDE and return to calling view"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exit IDE</span>
          </button>

          <div
            className={`h-4 w-px ${theme === 'vs-dark' ? 'bg-[#3e3e42]' : 'bg-slate-200'}`}
          />

          {/* IDE Logo & Wordmark */}
          <div className="flex items-center gap-1.5 font-bold text-xs">
            <div className="w-5 h-5 rounded bg-teal-600 flex items-center justify-center text-white">
              <Terminal className="w-3 h-3" />
            </div>
            <span className="hidden md:inline font-mono tracking-tight text-teal-500">
              SQL Studio IDE
            </span>
          </div>

          <div
            className={`h-4 w-px ${theme === 'vs-dark' ? 'bg-[#3e3e42]' : 'bg-slate-200'}`}
          />

          {/* Query Selector Menu Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsQueryMenuOpen(!isQueryMenuOpen)}
              className={`flex items-center gap-2 px-2.5 py-1 rounded text-xs border font-medium transition-colors ${
                theme === 'vs-dark'
                  ? 'bg-[#2d2d2d] border-[#3e3e42] hover:bg-[#383838] text-slate-200'
                  : 'bg-slate-50 border-slate-300 hover:bg-slate-100 text-slate-800'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-teal-500" />
              <span className="font-semibold max-w-[140px] sm:max-w-[220px] truncate">
                {titleDisplay}
              </span>
              {isDirty && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Unsaved changes" />
              )}
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {/* Dropdown Menu Popup */}
            {isQueryMenuOpen && (
              <div
                className={`absolute left-0 mt-1.5 w-80 max-h-96 rounded-lg shadow-2xl border z-50 flex flex-col text-xs ${
                  theme === 'vs-dark'
                    ? 'bg-[#252526] border-[#3e3e42] text-slate-200'
                    : 'bg-white border-slate-200 text-slate-800'
                }`}
              >
                {/* Header with New Query button */}
                <div
                  className={`p-2 border-b flex items-center justify-between ${
                    theme === 'vs-dark' ? 'border-[#333333]' : 'border-slate-100'
                  }`}
                >
                  <span className="font-bold text-[11px] uppercase tracking-wider text-slate-400">
                    Existing Saved Queries
                  </span>
                  <button
                    type="button"
                    onClick={handleStartNewQuery}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-medium"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New Blank</span>
                  </button>
                </div>

                {/* Search in Dropdown */}
                <div className="p-2 border-b border-inherit">
                  <div
                    className={`flex items-center gap-1.5 px-2 py-1 rounded border ${
                      theme === 'vs-dark'
                        ? 'bg-[#1e1e1e] border-[#3e3e42]'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <Search className="w-3 h-3 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Filter saved queries..."
                      value={queryFilterText}
                      onChange={(e) => setQueryFilterText(e.target.value)}
                      className="w-full bg-transparent outline-none text-xs"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Queries List */}
                <div className="overflow-y-auto divide-y divide-inherit p-1">
                  {filteredQueries.length === 0 ? (
                    <div className="p-4 text-center text-slate-400 text-xs">
                      No matching queries found
                    </div>
                  ) : (
                    filteredQueries.map((q) => {
                      const isSelected = q.id === currentQueryId;
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => handleSelectQueryFromMenu(q)}
                          className={`w-full text-left p-2 rounded flex items-start justify-between gap-2 transition-colors ${
                            isSelected
                              ? theme === 'vs-dark'
                                ? 'bg-teal-900/40 text-teal-200 font-semibold'
                                : 'bg-teal-50 text-teal-900 font-semibold'
                              : theme === 'vs-dark'
                              ? 'hover:bg-[#2d2d2d]'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              {isSelected && <Check className="w-3 h-3 text-teal-500 shrink-0" />}
                              <span className="truncate">{q.name}</span>
                            </div>
                            {q.description && (
                              <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                {q.description}
                              </p>
                            )}
                          </div>
                          <span
                            className={`shrink-0 text-[10px] px-1.5 py-0.2 rounded border font-mono ${
                              theme === 'vs-dark'
                                ? 'bg-[#1e1e1e] text-slate-400 border-[#3e3e42]'
                                : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            {q.category || 'General'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Edit Details Action (Pencil) */}
          <button
            type="button"
            onClick={handleOpenDetailsModal}
            className={`p-1.5 rounded transition-colors ${
              theme === 'vs-dark'
                ? 'hover:bg-[#37373d] text-slate-400 hover:text-slate-200'
                : 'hover:bg-slate-200 text-slate-600'
            }`}
            title="Edit Query Name, Category, or Description"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Center / Right: Primary Actions Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Run Query Button */}
          <button
            type="button"
            onClick={handleRunQuery}
            disabled={isRunning || !sqlCode.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs transition-colors shadow-xs"
            title="Execute SQL (or selected text) [Ctrl+Enter]"
          >
            <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : 'fill-white'}`} />
            <span className="hidden sm:inline">Run</span>
            <span className="hidden lg:inline text-[10px] font-mono opacity-80">(Ctrl+↵)</span>
          </button>

          {/* Prettify SQL Button */}
          <button
            type="button"
            onClick={handlePrettify}
            disabled={!sqlCode.trim()}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors ${
              theme === 'vs-dark'
                ? 'bg-[#2d2d2d] border-[#3e3e42] hover:bg-[#383838] text-teal-400'
                : 'bg-white border-slate-300 hover:bg-slate-50 text-teal-700'
            }`}
            title="Prettify & Format SQL [Shift+Alt+F]"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-500" />
            <span className="hidden md:inline">Prettify</span>
          </button>

          {/* Save Query (keeps in IDE) */}
          <button
            type="button"
            onClick={() => handleSaveQuery(false)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors ${
              theme === 'vs-dark'
                ? 'bg-[#2d2d2d] border-[#3e3e42] hover:bg-[#383838] text-slate-200'
                : 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700'
            }`}
            title="Save to t_sql_queries [Ctrl+S]"
          >
            <Save className="w-3.5 h-3.5 text-teal-500" />
            <span className="hidden sm:inline">Save</span>
          </button>

          {/* Save & Exit */}
          <button
            type="button"
            onClick={() => handleSaveQuery(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs transition-colors shadow-xs"
            title="Save to database and return to caller"
          >
            <Check className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save &amp; Exit</span>
          </button>

          <div
            className={`h-4 w-px mx-0.5 ${
              theme === 'vs-dark' ? 'bg-[#3e3e42]' : 'bg-slate-200'
            }`}
          />

          {/* Sidebar Toggle */}
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`p-1.5 rounded transition-colors ${
              isSidebarOpen
                ? 'bg-teal-600/20 text-teal-400'
                : theme === 'vs-dark'
                ? 'hover:bg-[#37373d] text-slate-400'
                : 'hover:bg-slate-200 text-slate-600'
            }`}
            title={isSidebarOpen ? 'Hide Schema Explorer' : 'Show Schema Explorer'}
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeft className="w-4 h-4" />
            )}
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={() => setTheme(theme === 'vs-dark' ? 'light' : 'vs-dark')}
            className={`p-1.5 rounded transition-colors ${
              theme === 'vs-dark'
                ? 'hover:bg-[#37373d] text-slate-400 hover:text-amber-400'
                : 'hover:bg-slate-200 text-slate-600 hover:text-slate-900'
            }`}
            title={`Switch to ${theme === 'vs-dark' ? 'Light' : 'VS Code Dark'} theme`}
          >
            {theme === 'vs-dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4 text-slate-700" />
            )}
          </button>
        </div>
      </header>

      {/* ── Main Workspace Body (Sidebar + Editor + Results) ─────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Collapsible Database Schema Explorer Sidebar ───────────────── */}
        {isSidebarOpen && (
          <aside
            className={`w-64 sm:w-72 shrink-0 flex flex-col border-r ${
              theme === 'vs-dark'
                ? 'bg-[#252526] border-[#333333]'
                : 'bg-white border-slate-200'
            }`}
          >
            {/* Sidebar Header */}
            <div
              className={`p-2.5 border-b flex items-center justify-between ${
                theme === 'vs-dark' ? 'border-[#333333]' : 'border-slate-100'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                <Database className="w-3.5 h-3.5 text-teal-500" />
                <span>Schema Explorer</span>
              </div>
              <span
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                  theme === 'vs-dark'
                    ? 'bg-[#1e1e1e] text-slate-400'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {schemaTables.length} tables
              </span>
            </div>

            {/* Filter Input */}
            <div className="p-2 border-b border-inherit">
              <div
                className={`flex items-center gap-1.5 px-2 py-1 rounded border ${
                  theme === 'vs-dark'
                    ? 'bg-[#1e1e1e] border-[#3e3e42]'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <Search className="w-3 h-3 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Filter tables/columns..."
                  value={schemaSearch}
                  onChange={(e) => setSchemaSearch(e.target.value)}
                  className="w-full bg-transparent outline-none text-xs"
                />
              </div>
            </div>

            {/* Tables & Columns Tree */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
              {filteredSchemaTables.map((tbl) => {
                const isExpanded = !!expandedTables[tbl.name];
                return (
                  <div key={tbl.name} className="rounded border border-transparent">
                    {/* Table Row */}
                    <div
                      className={`flex items-center justify-between p-1.5 rounded cursor-pointer group ${
                        theme === 'vs-dark'
                          ? 'hover:bg-[#2d2d2d]'
                          : 'hover:bg-slate-100'
                      }`}
                      onClick={() => toggleTableExpand(tbl.name)}
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <TableIcon className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                        <span className="font-semibold truncate font-mono">{tbl.name}</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`text-[10px] font-mono px-1 rounded ${
                            theme === 'vs-dark'
                              ? 'bg-[#1e1e1e] text-slate-400'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {tbl.rowCount}
                        </span>

                        {/* Quick Insert Table into Editor */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            insertTextIntoEditor(tbl.name);
                          }}
                          className={`opacity-0 group-hover:opacity-100 p-0.5 rounded text-[10px] font-medium text-teal-500 ${
                            theme === 'vs-dark' ? 'hover:bg-[#333]' : 'hover:bg-slate-200'
                          }`}
                          title={`Insert "${tbl.name}" into editor`}
                        >
                          Insert
                        </button>
                      </div>
                    </div>

                    {/* Columns List */}
                    {isExpanded && (
                      <div
                        className={`ml-5 pl-2 my-0.5 border-l space-y-0.5 ${
                          theme === 'vs-dark' ? 'border-[#3e3e42]' : 'border-slate-200'
                        }`}
                      >
                        {tbl.columns.map((col) => (
                          <div
                            key={col.cid}
                            onClick={() => insertTextIntoEditor(col.name)}
                            className={`flex items-center justify-between px-1.5 py-0.5 rounded cursor-pointer transition-colors group ${
                              theme === 'vs-dark'
                                ? 'hover:bg-[#2d2d2d] text-slate-300'
                                : 'hover:bg-slate-100 text-slate-700'
                            }`}
                            title={`Click to insert "${col.name}" into editor`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-mono text-[11px] truncate group-hover:text-teal-400">
                                {col.name}
                              </span>
                              {col.pk === 1 && (
                                <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono">
                                  PK
                                </span>
                              )}
                            </div>

                            <span
                              className={`text-[10px] font-mono uppercase ${
                                theme === 'vs-dark' ? 'text-slate-500' : 'text-slate-400'
                              }`}
                            >
                              {col.type}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Quick Helper at bottom of sidebar */}
            <div
              className={`p-2 border-t text-[11px] text-slate-400 flex items-center justify-between ${
                theme === 'vs-dark' ? 'border-[#333333]' : 'border-slate-100'
              }`}
            >
              <span>Click column to insert</span>
              <button
                type="button"
                onClick={() => insertTextIntoEditor('SELECT * FROM ')}
                className="text-teal-500 hover:underline"
              >
                + SELECT
              </button>
            </div>
          </aside>
        )}

        {/* ── Central Editor & Results Area ──────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Monaco Editor Container */}
          <div className="flex-1 relative min-h-[200px] overflow-hidden">
            <Editor
              height="100%"
              language="sql"
              theme={theme}
              value={sqlCode}
              onChange={(value) => {
                setSqlCode(value || '');
                setIsDirty(true);
              }}
              onMount={handleEditorMount}
              options={{
                automaticLayout: true,
                fontSize: 13,
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                lineNumbers: 'on',
                minimap: { enabled: showMinimap },
                scrollBeyondLastLine: false,
                renderLineHighlight: 'all',
                tabSize: 2,
                wordWrap: 'on',
                folding: true,
                suggestOnTriggerCharacters: true,
                quickSuggestions: {
                  other: true,
                  comments: false,
                  strings: true,
                },
                parameterHints: { enabled: true },
                bracketPairColorization: { enabled: true },
                padding: { top: 8, bottom: 8 },
              }}
            />
          </div>

          {/* ── Collapsible Execution Results / Help Drawer ───────────────── */}
          {isBottomPanelOpen && (
            <div
              className={`h-64 sm:h-72 shrink-0 flex flex-col border-t ${
                theme === 'vs-dark'
                  ? 'bg-[#1e1e1e] border-[#333333]'
                  : 'bg-white border-slate-200'
              }`}
            >
              {/* Drawer Header Tabs */}
              <div
                className={`h-9 shrink-0 flex items-center justify-between px-3 border-b ${
                  theme === 'vs-dark'
                    ? 'bg-[#252526] border-[#333333]'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveBottomTab('results')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                      activeBottomTab === 'results'
                        ? theme === 'vs-dark'
                          ? 'bg-[#1e1e1e] text-teal-400 border border-[#3e3e42]'
                          : 'bg-white text-teal-700 border border-slate-300 shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Terminal className="w-3.5 h-3.5" />
                    <span>Query Results</span>
                    {result && (
                      <span className="ml-1 text-[10px] font-mono px-1 rounded bg-teal-500/20 text-teal-400">
                        {result.values.length} rows
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveBottomTab('help')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                      activeBottomTab === 'help'
                        ? theme === 'vs-dark'
                          ? 'bg-[#1e1e1e] text-teal-400 border border-[#3e3e42]'
                          : 'bg-white text-teal-700 border border-slate-300 shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>IDE Help &amp; Shortcuts</span>
                  </button>
                </div>

                {/* Right Tab Actions */}
                <div className="flex items-center gap-2">
                  {activeBottomTab === 'results' && result && (
                    <>
                      <button
                        type="button"
                        onClick={handleCopyResultsJson}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          theme === 'vs-dark'
                            ? 'hover:bg-[#333] text-slate-300'
                            : 'hover:bg-slate-200 text-slate-700'
                        }`}
                        title="Copy results as formatted JSON"
                      >
                        {copiedResults ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedResults ? 'Copied' : 'JSON'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadCsv}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          theme === 'vs-dark'
                            ? 'hover:bg-[#333] text-slate-300'
                            : 'hover:bg-slate-200 text-slate-700'
                        }`}
                        title="Download results as CSV spreadsheet"
                      >
                        <Download className="w-3 h-3" />
                        <span>CSV</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsBottomPanelOpen(false)}
                    className={`p-1 rounded ${
                      theme === 'vs-dark' ? 'hover:bg-[#333] text-slate-400' : 'hover:bg-slate-200'
                    }`}
                    title="Minimize results panel"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Tab 1: Execution Results */}
              {activeBottomTab === 'results' && (
                <div className="flex-1 overflow-auto p-2">
                  {error ? (
                    <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-bold">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>SQLite Execution Error</span>
                      </div>
                      <p className="font-mono">{error}</p>
                    </div>
                  ) : !result ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 text-xs">
                      <Play className="w-6 h-6 mb-2 opacity-40" />
                      <p className="font-medium">No query executed yet</p>
                      <p className="text-[11px] opacity-70 mt-0.5">
                        Press <strong>Ctrl + Enter</strong> or click <strong>Run</strong> above to execute SQL statements.
                      </p>
                    </div>
                  ) : result.columns.length === 0 ? (
                    <div className="p-4 text-xs text-slate-400 space-y-1">
                      <p className="text-emerald-400 font-semibold">Statement executed successfully.</p>
                      <p className="font-mono text-[11px]">
                        Rows affected: {result.rowsAffected ?? 0} · Execution time:{' '}
                        {result.executionTimeMs.toFixed(1)} ms
                      </p>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col">
                      <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between px-1">
                        <span>
                          Returned <strong>{result.values.length}</strong> rows in{' '}
                          <strong>{result.executionTimeMs.toFixed(1)} ms</strong>
                        </span>
                        <span className="font-mono">{result.columns.length} columns</span>
                      </div>

                      <div className="flex-1 overflow-auto border rounded border-inherit">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead
                            className={`sticky top-0 z-10 font-mono text-[11px] ${
                              theme === 'vs-dark' ? 'bg-[#2d2d2d]' : 'bg-slate-100'
                            }`}
                          >
                            <tr>
                              <th className="p-2 border-b border-inherit w-10 text-slate-400 font-normal">
                                #
                              </th>
                              {result.columns.map((col) => (
                                <th
                                  key={col}
                                  className="p-2 border-b border-inherit font-semibold text-slate-300"
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-inherit font-mono">
                            {result.values.map((row, rIdx) => (
                              <tr
                                key={rIdx}
                                className={
                                  theme === 'vs-dark'
                                    ? 'hover:bg-[#2a2a2a]'
                                    : 'hover:bg-slate-50'
                                }
                              >
                                <td className="p-2 text-slate-500 text-[10px]">{rIdx + 1}</td>
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="p-2 whitespace-nowrap max-w-xs truncate">
                                    {cell === null ? (
                                      <span className="text-slate-500 italic">NULL</span>
                                    ) : (
                                      String(cell)
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

              {/* Tab 2: Help & Guidance Section */}
              {activeBottomTab === 'help' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Shortcuts Reference */}
                    <div
                      className={`p-3 rounded-lg border space-y-2 ${
                        theme === 'vs-dark'
                          ? 'bg-[#252526] border-[#333333]'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <h4 className="font-bold text-teal-400 flex items-center gap-1.5 text-xs">
                        <Terminal className="w-3.5 h-3.5" />
                        <span>Keyboard Shortcuts</span>
                      </h4>
                      <div className="space-y-1 text-[11px] font-mono">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Run Query / Selection:</span>
                          <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-white text-[10px]">
                            Ctrl + Enter
                          </kbd>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Save to t_sql_queries:</span>
                          <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-white text-[10px]">
                            Ctrl + S
                          </kbd>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Prettify SQL:</span>
                          <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-white text-[10px]">
                            Shift + Alt + F
                          </kbd>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Trigger IntelliSense:</span>
                          <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-white text-[10px]">
                            Ctrl + Space
                          </kbd>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Find / Replace:</span>
                          <kbd className="px-1.5 py-0.5 rounded bg-slate-700 text-white text-[10px]">
                            Ctrl + F
                          </kbd>
                        </div>
                      </div>
                    </div>

                    {/* How to use the IDE */}
                    <div
                      className={`p-3 rounded-lg border space-y-2 ${
                        theme === 'vs-dark'
                          ? 'bg-[#252526] border-[#333333]'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <h4 className="font-bold text-teal-400 flex items-center gap-1.5 text-xs">
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>IDE Guidance &amp; SQLite Features</span>
                      </h4>
                      <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-300 leading-relaxed">
                        <li>
                          <strong>Monaco Editor:</strong> Genuine Microsoft VS Code editor engine with syntax highlighting, multiline editing, and bracket colorization.
                        </li>
                        <li>
                          <strong>IntelliSense:</strong> As you type, table names (<code className="text-teal-400">t_pems</code>, <code className="text-teal-400">t_activities</code>) and columns appear automatically in auto-completion.
                        </li>
                        <li>
                          <strong>Partial Execution:</strong> Highlight any SQL fragment and press <kbd className="px-1 py-0.2 rounded bg-slate-700 text-white text-[10px]">Ctrl+Enter</kbd> to execute just that selected snippet!
                        </li>
                        <li>
                          <strong>Schema Explorer:</strong> Click any column name in the left panel to insert it directly into your query at the cursor.
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Status Bar ─────────────────────────────────────────────────── */}
          <footer
            className={`h-6 shrink-0 flex items-center justify-between px-3 text-[11px] font-mono border-t ${
              theme === 'vs-dark'
                ? 'bg-[#007acc] text-white border-transparent'
                : 'bg-teal-700 text-white border-teal-800'
            }`}
          >
            {/* Left: Position & Selection */}
            <div className="flex items-center gap-3">
              <span>
                Ln {editorCursorPos.line}, Col {editorCursorPos.col}
              </span>
              {selectedCharCount > 0 && <span>({selectedCharCount} selected)</span>}
              <span className="hidden sm:inline">| SQLite3 WASM</span>
            </div>

            {/* Right: Results toggle + Format indicator */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsBottomPanelOpen(!isBottomPanelOpen)}
                className="hover:underline flex items-center gap-1"
              >
                {isBottomPanelOpen ? 'Hide Drawer' : 'Show Drawer'}
              </button>
              <span className="hidden sm:inline">UTF-8</span>
              <span>SQL</span>
            </div>
          </footer>
        </div>
      </div>

      {/* ── Query Details / Metadata Modal ───────────────────────────────── */}
      {isDetailsModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div
            className={`w-full max-w-md rounded-xl border shadow-2xl p-5 space-y-4 ${
              theme === 'vs-dark'
                ? 'bg-[#252526] border-[#3e3e42] text-slate-100'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-inherit">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-teal-500" />
                <h3 className="font-bold text-sm">Query Metadata &amp; Name</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailsModalOpen(false)}
                className="p-1 rounded hover:bg-slate-500/20 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDetails} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Query Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Weekly Activity Deltas"
                  value={editNameInput}
                  onChange={(e) => setEditNameInput(e.target.value)}
                  className={`w-full px-3 py-2 rounded border outline-none ${
                    theme === 'vs-dark'
                      ? 'bg-[#1e1e1e] border-[#3e3e42] text-white focus:border-teal-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-teal-600'
                  }`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold">Category</label>
                  <button
                    type="button"
                    onClick={() => setIsCustomCategory(!isCustomCategory)}
                    className="text-[11px] text-teal-500 hover:underline"
                  >
                    {isCustomCategory ? 'Choose Existing' : '+ New Category'}
                  </button>
                </div>

                {isCustomCategory ? (
                  <input
                    type="text"
                    placeholder="Enter new category name"
                    value={editCategoryInput}
                    onChange={(e) => setEditCategoryInput(e.target.value)}
                    className={`w-full px-3 py-2 rounded border outline-none ${
                      theme === 'vs-dark'
                        ? 'bg-[#1e1e1e] border-[#3e3e42] text-white focus:border-teal-500'
                        : 'bg-white border-slate-300 text-slate-900 focus:border-teal-600'
                    }`}
                  />
                ) : (
                  <select
                    value={editCategoryInput}
                    onChange={(e) => {
                      if (e.target.value === '__NEW__') {
                        setIsCustomCategory(true);
                        setEditCategoryInput('');
                      } else {
                        setEditCategoryInput(e.target.value);
                      }
                    }}
                    className={`w-full px-3 py-2 rounded border outline-none ${
                      theme === 'vs-dark'
                        ? 'bg-[#1e1e1e] border-[#3e3e42] text-white focus:border-teal-500'
                        : 'bg-white border-slate-300 text-slate-900 focus:border-teal-600'
                    }`}
                  >
                    {existingCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="__NEW__">+ Create New Category...</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block font-semibold mb-1">Description (optional)</label>
                <textarea
                  rows={2}
                  placeholder="Summary of what this SQL query computes"
                  value={editDescInput}
                  onChange={(e) => setEditDescInput(e.target.value)}
                  className={`w-full px-3 py-2 rounded border outline-none resize-none ${
                    theme === 'vs-dark'
                      ? 'bg-[#1e1e1e] border-[#3e3e42] text-white focus:border-teal-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-teal-600'
                  }`}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-inherit">
                <button
                  type="button"
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="px-3 py-1.5 rounded border border-inherit hover:bg-slate-500/10 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs"
                >
                  Update Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Unsaved Changes Exit Confirmation Modal ───────────────────────── */}
      {showExitConfirm && (
        <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div
            className={`w-full max-w-sm rounded-xl border shadow-2xl p-5 space-y-4 ${
              theme === 'vs-dark'
                ? 'bg-[#252526] border-[#3e3e42] text-slate-100'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="space-y-1">
              <h3 className="font-bold text-sm">Unsaved Changes in IDE</h3>
              <p className="text-xs text-slate-400">
                You have modified SQL queries in the IDE. How would you like to proceed?
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2 text-xs">
              <button
                type="button"
                onClick={async () => {
                  await handleSaveQuery(true);
                }}
                className="w-full py-2 px-3 rounded bg-teal-600 hover:bg-teal-700 text-white font-semibold text-center"
              >
                Save to Database &amp; Exit
              </button>

              <button
                type="button"
                onClick={() => {
                  onExit({
                    saved: false,
                    queryId: currentQueryId,
                    queryName,
                    category,
                    description,
                    sql: sqlCode,
                  });
                }}
                className="w-full py-2 px-3 rounded border border-inherit hover:bg-slate-500/10 text-center font-medium"
              >
                Return with Edited SQL (without DB save)
              </button>

              <button
                type="button"
                onClick={() => {
                  onExit({
                    saved: false,
                    queryId: initialState.queryId,
                    queryName: initialState.queryName,
                    category: initialState.category,
                    description: initialState.description,
                    sql: initialState.sql,
                  });
                }}
                className="w-full py-2 px-3 rounded text-rose-400 hover:bg-rose-500/10 text-center"
              >
                Discard Changes &amp; Exit
              </button>

              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                className="w-full py-1.5 text-center text-slate-400 hover:underline text-[11px]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
