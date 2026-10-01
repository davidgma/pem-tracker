/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { get, set } from 'idb-keyval';
import { AsyncMutex } from './mutex';
import { ActivityRecord, PEMRecord, QueryExecutionResult, SettingRecord, SqlQueryRecord, TableSchemaInfo, ColumnSchemaInfo } from '../types/database.types';

const IDB_KEY_SQLITE_DATA = 'pem_sqlite_database_bin';
const IDB_KEY_UPDATED_AT = 'pem_sqlite_updated_at';

export type DatabaseChangeListener = () => void;

export interface MergeResult {
  inserted: number;
  updated: number;
  conflictsResolved: number;
  tombstonesApplied: number;
}

export class DatabaseService {
  private static instance: DatabaseService;
  private db: Database | null = null;
  private SQL: SqlJsStatic | null = null;
  private mutex = new AsyncMutex();
  private isInitialized = false;
  private changeListeners: Set<DatabaseChangeListener> = new Set();
  private lastModifiedTimestamp: number = Date.now();
  private isLocalDirty: boolean = false;

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Initializes the SQLite3 WASM engine and retrieves or seeds the database.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    return this.mutex.lock(async () => {
      if (this.isInitialized) return;

      let wasmBinary: ArrayBuffer | null = null;
      const sources = [
        sqlWasmUrl,
        '/sql-wasm.wasm',
        'https://sql.js.org/dist/sql-wasm.wasm',
        'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.wasm',
      ];

      for (const url of sources) {
        try {
          const resp = await fetch(url);
          if (!resp.ok) continue;
          const buf = await resp.arrayBuffer();
          const bytes = new Uint8Array(buf.slice(0, 4));
          // Validate WebAssembly magic header: 0x00 0x61 0x73 0x6d (\0asm)
          if (bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d) {
            wasmBinary = buf;
            break;
          } else {
            console.warn(`Source ${url} returned non-WASM content (e.g. HTML 404), checking next source...`);
          }
        } catch (fetchErr) {
          console.warn(`Failed to fetch wasm binary from ${url}:`, fetchErr);
        }
      }

      if (wasmBinary) {
        this.SQL = await initSqlJs({ wasmBinary });
      } else {
        // Fallback to standard initSqlJs locator if direct binary fetch was blocked by CORS
        this.SQL = await initSqlJs({
          locateFile: () => sqlWasmUrl || 'https://sql.js.org/dist/sql-wasm.wasm',
        });
      }

      // Check IndexedDB local cache first for fast offline startup
      const cachedData = await get<Uint8Array>(IDB_KEY_SQLITE_DATA);
      const cachedTimestamp = await get<number>(IDB_KEY_UPDATED_AT);

      if (cachedData && cachedData.length > 0) {
        try {
          this.db = new this.SQL.Database(cachedData);
          if (cachedTimestamp) {
            this.lastModifiedTimestamp = cachedTimestamp;
          }
        } catch (e) {
          console.error('Failed to parse cached SQLite DB, creating new one', e);
          this.db = new this.SQL.Database();
        }
      } else {
        this.db = new this.SQL.Database();
      }

      // Ensure required tables & migration columns exist
      await this.ensureSchema();

      // Check if seeded data exists, if not, provide realistic chronic illness pacing records
      await this.seedInitialRecordsIfEmpty();

      // Persist to local cache
      await this.persistToLocalCache();

      this.isInitialized = true;
    });
  }

  /**
   * Abstracted schema initialization to guarantee t_pems, t_activities, and t_tombstones exist
   */
  private async ensureSchema(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run(`
      CREATE TABLE IF NOT EXISTS t_pems (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pem_date TEXT NOT NULL,
        headache REAL DEFAULT 0,
        fatigue REAL DEFAULT 0,
        eye_stinging REAL DEFAULT 0,
        general_malaise REAL DEFAULT 0,
        brain_fog REAL DEFAULT 0,
        client_uuid TEXT,
        updated_at TEXT
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS t_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        activity_date TEXT NOT NULL,
        activity_name TEXT NOT NULL,
        duration REAL DEFAULT 0,
        start_steps REAL DEFAULT 0,
        end_steps REAL DEFAULT 0,
        start_calories REAL DEFAULT 0,
        end_calories REAL DEFAULT 0,
        start_moderate REAL DEFAULT 0,
        end_moderate REAL DEFAULT 0,
        start_vigorous REAL DEFAULT 0,
        end_vigorous REAL DEFAULT 0,
        start_peak REAL DEFAULT 0,
        end_peak REAL DEFAULT 0,
        client_uuid TEXT,
        updated_at TEXT
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS t_tombstones (
        client_uuid TEXT PRIMARY KEY,
        deleted_at TEXT NOT NULL,
        entity_type TEXT NOT NULL
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS t_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        setting_name TEXT UNIQUE,
        setting_value TEXT
      );
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS t_sql_queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        sql_text TEXT NOT NULL,
        category TEXT DEFAULT 'General',
        created_at TEXT,
        updated_at TEXT
      );
    `);

    // Ensure default settings (update_frequency and default_activity_duration)
    this.db.run(`
      INSERT OR IGNORE INTO t_settings (setting_name, setting_value)
      VALUES ('update_frequency', '120');
    `);
    this.db.run(`
      INSERT OR IGNORE INTO t_settings (setting_name, setting_value)
      VALUES ('default_activity_duration', '60');
    `);

    this.ensurePresetQueriesSeeded();

    // Migration safety: Ensure client_uuid and updated_at exist in older tables
    try {
      const pemCols = this.db.exec("PRAGMA table_info(t_pems)")[0]?.values.map((v) => v[1]) || [];
      if (!pemCols.includes('client_uuid')) {
        this.db.run("ALTER TABLE t_pems ADD COLUMN client_uuid TEXT");
      }
      if (!pemCols.includes('updated_at')) {
        this.db.run("ALTER TABLE t_pems ADD COLUMN updated_at TEXT");
      }
      this.db.run(`UPDATE t_pems SET client_uuid = 'pem_' || id || '_' || substr(hex(randomblob(4)), 1, 8) WHERE client_uuid IS NULL OR client_uuid = ''`);
      this.db.run(`UPDATE t_pems SET updated_at = pem_date WHERE updated_at IS NULL OR updated_at = ''`);

      const actCols = this.db.exec("PRAGMA table_info(t_activities)")[0]?.values.map((v) => v[1]) || [];
      if (!actCols.includes('client_uuid')) {
        this.db.run("ALTER TABLE t_activities ADD COLUMN client_uuid TEXT");
      }
      if (!actCols.includes('updated_at')) {
        this.db.run("ALTER TABLE t_activities ADD COLUMN updated_at TEXT");
      }
      this.db.run(`UPDATE t_activities SET client_uuid = 'act_' || id || '_' || substr(hex(randomblob(4)), 1, 8) WHERE client_uuid IS NULL OR client_uuid = ''`);
      this.db.run(`UPDATE t_activities SET updated_at = activity_date WHERE updated_at IS NULL OR updated_at = ''`);
    } catch (migErr) {
      console.warn('Migration inspection notice:', migErr);
    }
  }

  /**
   * Seed realistic sample data if both tables are empty
   */
  private async seedInitialRecordsIfEmpty(): Promise<void> {
    if (!this.db) return;

    const pemCountRes = this.db.exec('SELECT COUNT(*) as count FROM t_pems');
    const pemCount = pemCountRes[0]?.values[0]?.[0] || 0;

    const actCountRes = this.db.exec('SELECT COUNT(*) as count FROM t_activities');
    const actCount = actCountRes[0]?.values[0]?.[0] || 0;

    if (pemCount === 0 && actCount === 0) {
      const now = new Date();
      const formatIso = (d: Date) => d.toISOString().replace('T', ' ').substring(0, 19);

      // Day -4: Safe baseline day
      const d4 = new Date(now.getTime() - 4 * 86400000);
      d4.setHours(9, 30, 0, 0);
      this.db.run(
        `INSERT INTO t_activities (activity_date, activity_name, duration, start_steps, end_steps, start_calories, end_calories, start_moderate, end_moderate, start_vigorous, end_vigorous, start_peak, end_peak, client_uuid, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [formatIso(d4), 'Gentle Stretch & Breathing', 15, 120, 310, 14, 38, 0, 2, 0, 0, 0, 0, 'seed_act_1', formatIso(d4)]
      );

      const p4 = new Date(d4.getTime());
      p4.setHours(20, 0, 0, 0);
      this.db.run(
        `INSERT INTO t_pems (pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog, client_uuid, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [formatIso(p4), 1, 2, 0, 1, 1, 'seed_pem_1', formatIso(p4)]
      );

      // Day -3: Overexertion trigger event
      const d3 = new Date(now.getTime() - 3 * 86400000);
      d3.setHours(14, 15, 0, 0);
      this.db.run(
        `INSERT INTO t_activities (activity_date, activity_name, duration, start_steps, end_steps, start_calories, end_calories, start_moderate, end_moderate, start_vigorous, end_vigorous, start_peak, end_peak, client_uuid, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [formatIso(d3), 'Grocery Shopping (Exceeded Pacing Limit)', 55, 620, 3850, 80, 340, 2, 28, 0, 8, 0, 2, 'seed_act_2', formatIso(d3)]
      );

      const p3 = new Date(d3.getTime());
      p3.setHours(21, 30, 0, 0);
      this.db.run(
        `INSERT INTO t_pems (pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog, client_uuid, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [formatIso(p3), 2, 4, 1, 2, 2, 'seed_pem_2', formatIso(p3)]
      );

      // Day -2: 24h Delayed Crash Phase Begins
      const d2 = new Date(now.getTime() - 2 * 86400000);
      d2.setHours(10, 0, 0, 0);
      this.db.run(
        `INSERT INTO t_activities (activity_date, activity_name, duration, start_steps, end_steps, start_calories, end_calories, start_moderate, end_moderate, start_vigorous, end_vigorous, start_peak, end_peak, client_uuid, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [formatIso(d2), 'Pacing Rest & Hydration', 30, 210, 260, 25, 45, 0, 0, 0, 0, 0, 0, 'seed_act_3', formatIso(d2)]
      );

      const p2 = new Date(d2.getTime());
      p2.setHours(18, 0, 0, 0);
      this.db.run(
        `INSERT INTO t_pems (pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog, client_uuid, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [formatIso(p2), 6, 7.5, 5, 7, 6.5, 'seed_pem_3', formatIso(p2)]
      );

      // Day -1: Peak 48h Delayed PEM Crash
      const p1 = new Date(now.getTime() - 1 * 86400000);
      p1.setHours(15, 30, 0, 0);
      this.db.run(
        `INSERT INTO t_pems (pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog, client_uuid, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [formatIso(p1), 7, 8.5, 6, 8, 7.5, 'seed_pem_4', formatIso(p1)]
      );

      // Day 0: Today - Gentle Pacing Recovery
      const d0 = new Date(now.getTime());
      d0.setHours(11, 0, 0, 0);
      this.db.run(
        `INSERT INTO t_activities (activity_date, activity_name, duration, start_steps, end_steps, start_calories, end_calories, start_moderate, end_moderate, start_vigorous, end_vigorous, start_peak, end_peak, client_uuid, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [formatIso(d0), 'Morning Slow Pacing Routine', 20, 150, 480, 20, 75, 0, 3, 0, 0, 0, 0, 'seed_act_4', formatIso(d0)]
      );

      const p0 = new Date(now.getTime());
      p0.setHours(16, 0, 0, 0);
      this.db.run(
        `INSERT INTO t_pems (pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog, client_uuid, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [formatIso(p0), 4, 5.5, 3, 5, 4, 'seed_pem_5', formatIso(p0)]
      );
    }
  }

  /**
   * Persists SQLite memory state into browser IndexedDB
   */
  private async persistToLocalCache(): Promise<void> {
    if (!this.db) return;
    try {
      const data = this.db.export();
      await set(IDB_KEY_SQLITE_DATA, data);
      this.lastModifiedTimestamp = Date.now();
      await set(IDB_KEY_UPDATED_AT, this.lastModifiedTimestamp);
    } catch (e) {
      console.error('Failed to persist SQLite to IndexedDB:', e);
    }
  }

  /**
   * Abstracted Thread-Safe Query
   */
  public async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    await this.initialize();
    return this.mutex.lock(async () => {
      if (!this.db) throw new Error('Database not initialized');

      const stmt = this.db.prepare(sql);
      if (params && params.length > 0) {
        stmt.bind(params);
      }

      const results: T[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject() as T;
        results.push(row);
      }
      stmt.free();
      return results;
    });
  }

  /**
   * Abstracted Thread-Safe Run (INSERT, UPDATE, DELETE)
   */
  public async run(sql: string, params: any[] = []): Promise<{ changes: number }> {
    await this.initialize();
    return this.mutex.lock(async () => {
      if (!this.db) throw new Error('Database not initialized');

      this.db.run(sql, params);
      const changes = this.db.getRowsModified();

      this.isLocalDirty = true;
      await this.persistToLocalCache();
      this.notifyChange();
      return { changes };
    });
  }

  /**
   * Run raw SQL command with detailed timing and tabular results
   */
  public async executeRawWithStats(sql: string): Promise<QueryExecutionResult> {
    await this.initialize();
    return this.mutex.lock(async () => {
      if (!this.db) throw new Error('Database not initialized');

      const startTime = performance.now();
      const results = this.db.exec(sql);
      const duration = Math.round((performance.now() - startTime) * 100) / 100;

      const isMutation = /^(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)/i.test(sql.trim());
      let rowsAffected: number | undefined;

      if (isMutation) {
        rowsAffected = this.db.getRowsModified();
        this.isLocalDirty = true;
        await this.persistToLocalCache();
        this.notifyChange();
      }

      if (results.length === 0) {
        return {
          columns: [],
          values: [],
          executionTimeMs: duration,
          rowsAffected,
        };
      }

      const first = results[0];
      return {
        columns: first.columns,
        values: first.values,
        executionTimeMs: duration,
        rowsAffected,
      };
    });
  }

  /**
   * Export the entire SQLite database as a binary Uint8Array
   */
  public async exportDatabase(): Promise<Uint8Array> {
    await this.initialize();
    return this.mutex.lock(async () => {
      if (!this.db) throw new Error('Database not initialized');
      return this.db.export();
    });
  }

  /**
   * Export the entire database as a standard SQLite SQL dump text script (.dump)
   */
  public async exportSqlDump(): Promise<string> {
    await this.initialize();
    return this.mutex.lock(async () => {
      if (!this.db) throw new Error('Database not initialized');
      const lines: string[] = [
        '-- PEM Tracker SQLite Database Dump',
        `-- Generated at: ${new Date().toISOString()}`,
        'PRAGMA foreign_keys=OFF;',
        'BEGIN TRANSACTION;',
        '',
      ];

      // Export schema and data for tables
      const tables = ['t_pems', 't_activities', 't_settings', 't_sql_queries', 't_tombstones'];
      for (const table of tables) {
        // Table schema
        const schemaRes = this.db.exec(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}'`
        );
        if (schemaRes.length > 0 && schemaRes[0].values.length > 0) {
          lines.push(`${schemaRes[0].values[0][0]};`);
        }

        // Table rows
        const rowsRes = this.db.exec(`SELECT * FROM ${table}`);
        if (rowsRes.length > 0 && rowsRes[0].values.length > 0) {
          const cols = rowsRes[0].columns.join(', ');
          for (const row of rowsRes[0].values) {
            const vals = row
              .map((v) => {
                if (v === null || v === undefined) return 'NULL';
                if (typeof v === 'number') return v;
                return `'${String(v).replace(/'/g, "''")}'`;
              })
              .join(', ');
            lines.push(`INSERT OR REPLACE INTO ${table} (${cols}) VALUES (${vals});`);
          }
        }
        lines.push('');
      }

      lines.push('COMMIT;');
      return lines.join('\n');
    });
  }

  /**
   * Imports and executes a SQL script (.sql dump)
   */
  public async importSqlDump(sqlScript: string): Promise<void> {
    await this.initialize();
    return this.mutex.lock(async () => {
      if (!this.SQL) throw new Error('SQL engine not ready');
      if (!this.db) {
        this.db = new this.SQL.Database();
      }
      this.db.run(sqlScript);
      await this.ensureSchema();
      this.isLocalDirty = false;
      await this.persistToLocalCache();
      this.notifyChange();
    });
  }

  /**
   * Replace the active SQLite database with remote pCloud or imported binary data
   */
  public async loadDatabaseBinary(binaryData: Uint8Array): Promise<void> {
    await this.initialize();
    return this.mutex.lock(async () => {
      if (!this.SQL) throw new Error('SQL engine not ready');

      this.db = new this.SQL.Database(binaryData);
      await this.ensureSchema();
      this.isLocalDirty = false;
      await this.persistToLocalCache();
      this.notifyChange();
    });
  }

  /**
   * Smart Multi-Device Bidirectional Reconciliation & Merge
   * Avoids collision and data loss when desktop and mobile both make offline updates:
   * 1. Merges t_tombstones (deletions across devices)
   * 2. Merges t_pems (matching client_uuid, LWW updated_at)
   * 3. Merges t_activities (matching client_uuid, LWW updated_at)
   */
  public async mergeDatabaseBinary(remoteBinaryData: Uint8Array): Promise<MergeResult> {
    await this.initialize();
    return this.mutex.lock(async () => {
      if (!this.SQL || !this.db) throw new Error('Database engine not initialized');

      let remoteDb: Database;
      try {
        remoteDb = new this.SQL.Database(remoteBinaryData);
      } catch (err: any) {
        throw new Error('Failed to open remote SQLite database for merging: ' + err.message);
      }

      let inserted = 0;
      let updated = 0;
      let conflictsResolved = 0;
      let tombstonesApplied = 0;

      // 0. Ensure schema on both
      try {
        remoteDb.run(`CREATE TABLE IF NOT EXISTS t_tombstones (client_uuid TEXT PRIMARY KEY, deleted_at TEXT NOT NULL, entity_type TEXT NOT NULL);`);
      } catch (e) {
        // ignore
      }

      // Collect all tombstones from remote and local
      const knownTombstones = new Map<string, { deleted_at: string; entity_type: string }>();

      try {
        const localTombs = this.db.exec('SELECT client_uuid, deleted_at, entity_type FROM t_tombstones');
        if (localTombs.length > 0) {
          for (const val of localTombs[0].values) {
            knownTombstones.set(val[0] as string, { deleted_at: val[1] as string, entity_type: val[2] as string });
          }
        }
      } catch (e) {
        // ignore
      }

      try {
        const remoteTombs = remoteDb.exec('SELECT client_uuid, deleted_at, entity_type FROM t_tombstones');
        if (remoteTombs.length > 0) {
          for (const val of remoteTombs[0].values) {
            const uuid = val[0] as string;
            const delAt = val[1] as string;
            const ent = val[2] as string;
            if (!knownTombstones.has(uuid)) {
              knownTombstones.set(uuid, { deleted_at: delAt, entity_type: ent });
              this.db.run('INSERT OR REPLACE INTO t_tombstones (client_uuid, deleted_at, entity_type) VALUES (?, ?, ?)', [uuid, delAt, ent]);
            }
          }
        }
      } catch (e) {
        // ignore
      }

      // Apply tombstones to local database (delete items marked deleted by remote)
      for (const [uuid, tomb] of knownTombstones.entries()) {
        if (tomb.entity_type === 'pem') {
          const res = this.db.exec(`SELECT id FROM t_pems WHERE client_uuid = '${uuid.replace(/'/g, "''")}'`);
          if (res.length > 0 && res[0].values.length > 0) {
            this.db.run(`DELETE FROM t_pems WHERE client_uuid = '${uuid.replace(/'/g, "''")}'`);
            tombstonesApplied++;
          }
        } else if (tomb.entity_type === 'activity') {
          const res = this.db.exec(`SELECT id FROM t_activities WHERE client_uuid = '${uuid.replace(/'/g, "''")}'`);
          if (res.length > 0 && res[0].values.length > 0) {
            this.db.run(`DELETE FROM t_activities WHERE client_uuid = '${uuid.replace(/'/g, "''")}'`);
            tombstonesApplied++;
          }
        }
      }

      // 1. Reconcile t_pems
      try {
        const remotePems = remoteDb.exec('SELECT * FROM t_pems');
        if (remotePems.length > 0) {
          const cols = remotePems[0].columns;
          const values = remotePems[0].values;
          const uuidIdx = cols.indexOf('client_uuid');
          const dateIdx = cols.indexOf('pem_date');
          const updatedIdx = cols.indexOf('updated_at');

          for (const val of values) {
            const rowObj: any = {};
            cols.forEach((col, i) => {
              rowObj[col] = val[i];
            });

            const remoteUuid = uuidIdx >= 0 ? (rowObj.client_uuid as string) : null;
            if (remoteUuid && knownTombstones.has(remoteUuid)) {
              // Row was previously deleted, do not restore
              continue;
            }

            const remoteDate = dateIdx >= 0 ? (rowObj.pem_date as string) : '';
            const remoteUpdatedAt = updatedIdx >= 0 && rowObj.updated_at ? new Date(rowObj.updated_at).getTime() : 0;

            let existingLocal: any[] = [];
            if (remoteUuid) {
              existingLocal = this.db.exec(`SELECT * FROM t_pems WHERE client_uuid = '${remoteUuid.replace(/'/g, "''")}'`);
            }
            if (existingLocal.length === 0 && remoteDate) {
              existingLocal = this.db.exec(`SELECT * FROM t_pems WHERE pem_date = '${remoteDate.replace(/'/g, "''")}'`);
            }

            if (existingLocal.length === 0 || existingLocal[0].values.length === 0) {
              // Record exists on remote device but not local -> INSERT into local
              const newUuid = remoteUuid || ('pem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
              this.db.run(
                `INSERT INTO t_pems (pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog, client_uuid, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  rowObj.pem_date,
                  rowObj.headache ?? 0,
                  rowObj.fatigue ?? 0,
                  rowObj.eye_stinging ?? 0,
                  rowObj.general_malaise ?? 0,
                  rowObj.brain_fog ?? 0,
                  newUuid,
                  rowObj.updated_at || rowObj.pem_date,
                ]
              );
              inserted++;
            } else {
              // Exists on both devices -> Last-Write-Wins (LWW) conflict resolution
              const localCols = existingLocal[0].columns;
              const localVals = existingLocal[0].values[0];
              const localId = localVals[localCols.indexOf('id')];
              const localUpdatedIdx = localCols.indexOf('updated_at');
              const localUpdatedAt = localUpdatedIdx >= 0 && localVals[localUpdatedIdx] ? new Date(localVals[localUpdatedIdx]).getTime() : 0;

              if (remoteUpdatedAt > localUpdatedAt) {
                this.db.run(
                  `UPDATE t_pems SET headache = ?, fatigue = ?, eye_stinging = ?, general_malaise = ?, brain_fog = ?, updated_at = ? WHERE id = ?`,
                  [
                    rowObj.headache ?? 0,
                    rowObj.fatigue ?? 0,
                    rowObj.eye_stinging ?? 0,
                    rowObj.general_malaise ?? 0,
                    rowObj.brain_fog ?? 0,
                    rowObj.updated_at || new Date().toISOString(),
                    localId,
                  ]
                );
                updated++;
                conflictsResolved++;
              } else {
                conflictsResolved++;
              }
            }
          }
        }
      } catch (pemMergeErr) {
        console.warn('PEM merge step notice:', pemMergeErr);
      }

      // 2. Reconcile t_activities
      try {
        const remoteActs = remoteDb.exec('SELECT * FROM t_activities');
        if (remoteActs.length > 0) {
          const cols = remoteActs[0].columns;
          const values = remoteActs[0].values;
          const uuidIdx = cols.indexOf('client_uuid');
          const dateIdx = cols.indexOf('activity_date');
          const nameIdx = cols.indexOf('activity_name');
          const updatedIdx = cols.indexOf('updated_at');

          for (const val of values) {
            const rowObj: any = {};
            cols.forEach((col, i) => {
              rowObj[col] = val[i];
            });

            const remoteUuid = uuidIdx >= 0 ? (rowObj.client_uuid as string) : null;
            if (remoteUuid && knownTombstones.has(remoteUuid)) {
              // Row was deleted on local device, do not re-add
              continue;
            }

            const remoteDate = dateIdx >= 0 ? (rowObj.activity_date as string) : '';
            const remoteName = nameIdx >= 0 ? (rowObj.activity_name as string) : '';
            const remoteUpdatedAt = updatedIdx >= 0 && rowObj.updated_at ? new Date(rowObj.updated_at).getTime() : 0;

            let existingLocal: any[] = [];
            if (remoteUuid) {
              existingLocal = this.db.exec(`SELECT * FROM t_activities WHERE client_uuid = '${remoteUuid.replace(/'/g, "''")}'`);
            }
            if (existingLocal.length === 0 && remoteDate && remoteName) {
              existingLocal = this.db.exec(
                `SELECT * FROM t_activities WHERE activity_date = '${remoteDate.replace(/'/g, "''")}' AND activity_name = '${remoteName.replace(/'/g, "''")}'`
              );
            }

            if (existingLocal.length === 0 || existingLocal[0].values.length === 0) {
              // Record exists on remote but not local -> INSERT into local
              const newUuid = remoteUuid || ('act_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));
              this.db.run(
                `INSERT INTO t_activities (
                  activity_date, activity_name, duration,
                  start_steps, end_steps, start_calories, end_calories,
                  start_moderate, end_moderate, start_vigorous, end_vigorous,
                  start_peak, end_peak, client_uuid, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  rowObj.activity_date,
                  rowObj.activity_name,
                  rowObj.duration ?? 0,
                  rowObj.start_steps ?? 0,
                  rowObj.end_steps ?? 0,
                  rowObj.start_calories ?? 0,
                  rowObj.end_calories ?? 0,
                  rowObj.start_moderate ?? 0,
                  rowObj.end_moderate ?? 0,
                  rowObj.start_vigorous ?? 0,
                  rowObj.end_vigorous ?? 0,
                  rowObj.start_peak ?? 0,
                  rowObj.end_peak ?? 0,
                  newUuid,
                  rowObj.updated_at || rowObj.activity_date,
                ]
              );
              inserted++;
            } else {
              // Exists in both -> Check timestamps for conflict resolution
              const localCols = existingLocal[0].columns;
              const localVals = existingLocal[0].values[0];
              const localId = localVals[localCols.indexOf('id')];
              const localUpdatedIdx = localCols.indexOf('updated_at');
              const localUpdatedAt = localUpdatedIdx >= 0 && localVals[localUpdatedIdx] ? new Date(localVals[localUpdatedIdx]).getTime() : 0;

              if (remoteUpdatedAt > localUpdatedAt) {
                this.db.run(
                  `UPDATE t_activities SET
                    activity_name = ?, duration = ?,
                    start_steps = ?, end_steps = ?,
                    start_calories = ?, end_calories = ?,
                    start_moderate = ?, end_moderate = ?,
                    start_vigorous = ?, end_vigorous = ?,
                    start_peak = ?, end_peak = ?,
                    updated_at = ?
                  WHERE id = ?`,
                  [
                    rowObj.activity_name,
                    rowObj.duration,
                    rowObj.start_steps,
                    rowObj.end_steps,
                    rowObj.start_calories,
                    rowObj.end_calories,
                    rowObj.start_moderate,
                    rowObj.end_moderate,
                    rowObj.start_vigorous,
                    rowObj.end_vigorous,
                    rowObj.start_peak,
                    rowObj.end_peak,
                    rowObj.updated_at || new Date().toISOString(),
                    localId,
                  ]
                );
                updated++;
                conflictsResolved++;
              } else {
                conflictsResolved++;
              }
            }
          }
        }
      } catch (actMergeErr) {
        console.warn('Activity merge step notice:', actMergeErr);
      }

      // Close remote database object
      try {
        remoteDb.close();
      } catch (e) {
        // ignore
      }

      // Local state is now the reconciled union of both devices
      this.isLocalDirty = false;
      await this.persistToLocalCache();
      this.notifyChange();

      return { inserted, updated, conflictsResolved, tombstonesApplied };
    });
  }

  public isDirty(): boolean {
    return this.isLocalDirty;
  }

  public markClean(): void {
    this.isLocalDirty = false;
  }

  public markDirty(): void {
    this.isLocalDirty = true;
  }

  public getLastModified(): number {
    return this.lastModifiedTimestamp;
  }

  public addChangeListener(listener: DatabaseChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => {
      this.changeListeners.delete(listener);
    };
  }

  private notifyChange(): void {
    this.changeListeners.forEach((listener) => {
      try {
        listener();
      } catch (e) {
        console.error('Error in database change listener:', e);
      }
    });
  }

  // Domain helpers
  public async getAllPEMs(): Promise<PEMRecord[]> {
    return this.query<PEMRecord>('SELECT * FROM t_pems ORDER BY pem_date DESC');
  }

  public async getAllActivities(): Promise<ActivityRecord[]> {
    return this.query<ActivityRecord>('SELECT * FROM t_activities ORDER BY activity_date DESC');
  }

  public async insertPEM(pem: Omit<PEMRecord, 'id'>): Promise<void> {
    const uuid = pem.client_uuid || ('pem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));
    const nowIso = pem.updated_at || new Date().toISOString();

    await this.run(
      `INSERT INTO t_pems (pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog, client_uuid, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        pem.pem_date,
        pem.headache,
        pem.fatigue,
        pem.eye_stinging,
        pem.general_malaise,
        pem.brain_fog,
        uuid,
        nowIso,
      ]
    );
  }

  public async deletePEM(id: number): Promise<void> {
    const recs = await this.query<{ client_uuid?: string }>('SELECT client_uuid FROM t_pems WHERE id = ?', [id]);
    const uuid = recs[0]?.client_uuid;

    await this.run('DELETE FROM t_pems WHERE id = ?', [id]);

    if (uuid) {
      await this.run(
        'INSERT OR REPLACE INTO t_tombstones (client_uuid, deleted_at, entity_type) VALUES (?, ?, ?)',
        [uuid, new Date().toISOString(), 'pem']
      );
    }
  }

  public async updatePEM(pem: PEMRecord): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.run(
      `UPDATE t_pems SET
        pem_date = ?,
        headache = ?,
        fatigue = ?,
        eye_stinging = ?,
        general_malaise = ?,
        brain_fog = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        pem.pem_date,
        pem.headache,
        pem.fatigue,
        pem.eye_stinging,
        pem.general_malaise,
        pem.brain_fog,
        nowIso,
        pem.id,
      ]
    );
  }

  public async insertActivity(act: Omit<ActivityRecord, 'id'>): Promise<void> {
    const uuid = act.client_uuid || ('act_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9));
    const nowIso = act.updated_at || new Date().toISOString();

    await this.run(
      `INSERT INTO t_activities (
        activity_date, activity_name, duration,
        start_steps, end_steps,
        start_calories, end_calories,
        start_moderate, end_moderate,
        start_vigorous, end_vigorous,
        start_peak, end_peak,
        client_uuid, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        act.activity_date,
        act.activity_name,
        act.duration,
        act.start_steps,
        act.end_steps,
        act.start_calories,
        act.end_calories,
        act.start_moderate,
        act.end_moderate,
        act.start_vigorous,
        act.end_vigorous,
        act.start_peak,
        act.end_peak,
        uuid,
        nowIso,
      ]
    );
  }

  public async updateActivity(act: ActivityRecord): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.run(
      `UPDATE t_activities SET
        activity_date = ?,
        activity_name = ?,
        duration = ?,
        start_steps = ?,
        end_steps = ?,
        start_calories = ?,
        end_calories = ?,
        start_moderate = ?,
        end_moderate = ?,
        start_vigorous = ?,
        end_vigorous = ?,
        start_peak = ?,
        end_peak = ?,
        updated_at = ?
      WHERE id = ?`,
      [
        act.activity_date,
        act.activity_name,
        act.duration,
        act.start_steps,
        act.end_steps,
        act.start_calories,
        act.end_calories,
        act.start_moderate,
        act.end_moderate,
        act.start_vigorous,
        act.end_vigorous,
        act.start_peak,
        act.end_peak,
        nowIso,
        act.id,
      ]
    );
  }

  public async deleteActivity(id: number): Promise<void> {
    const recs = await this.query<{ client_uuid?: string }>('SELECT client_uuid FROM t_activities WHERE id = ?', [id]);
    const uuid = recs[0]?.client_uuid;

    await this.run('DELETE FROM t_activities WHERE id = ?', [id]);

    if (uuid) {
      await this.run(
        'INSERT OR REPLACE INTO t_tombstones (client_uuid, deleted_at, entity_type) VALUES (?, ?, ?)',
        [uuid, new Date().toISOString(), 'activity']
      );
    }
  }

  private ensurePresetQueriesSeeded(): void {
    if (!this.db) return;
    try {
      const qRes = this.db.exec('SELECT COUNT(*) FROM t_sql_queries');
      const count = qRes[0]?.values[0]?.[0] || 0;
      if (count === 0) {
        this.seedPresetQueries();
      }
    } catch (e) {
      console.warn('Failed to inspect t_sql_queries:', e);
    }
  }

  private seedPresetQueries(): void {
    if (!this.db) return;
    const nowIso = new Date().toISOString();
    const defaults = [
      {
        name: 'Recent PEM Episodes',
        category: 'PEM Tracking',
        description: 'Shows the 15 most recent symptom severity entries (0-10 scale)',
        sql: 'SELECT id, pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog FROM t_pems ORDER BY pem_date DESC LIMIT 15;',
      },
      {
        name: 'Recent Daily Activities',
        category: 'Activities',
        description: 'Shows the 15 most recent recorded exertion sessions with computed steps and minutes',
        sql: 'SELECT id, activity_date, activity_name, duration, (end_steps - start_steps) AS delta_steps, (end_calories - start_calories) AS delta_cals, (end_moderate - start_moderate) AS mod_mins, (end_vigorous - start_vigorous) AS vig_mins, (end_peak - start_peak) AS peak_mins FROM t_activities ORDER BY activity_date DESC LIMIT 15;',
      },
      {
        name: 'Daily Energy Rollup',
        category: 'Rollups',
        description: 'Aggregates daily steps, calories, and active intensity minutes by date',
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
        name: 'Exertion vs PEM Crash Lag',
        category: 'Analysis',
        description: 'Correlates high-exertion days with subsequent next-day PEM crash symptoms',
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
        name: 'Schema: t_pems',
        category: 'Schema',
        description: 'Columns and types for the PEM symptoms table',
        sql: 'PRAGMA table_info(t_pems);',
      },
      {
        name: 'Schema: t_activities',
        category: 'Schema',
        description: 'Columns and types for the activities table',
        sql: 'PRAGMA table_info(t_activities);',
      },
      {
        name: 'Schema: t_settings',
        category: 'Schema',
        description: 'Columns and types for the system settings table',
        sql: 'PRAGMA table_info(t_settings);',
      },
      {
        name: 'Schema: t_sql_queries',
        category: 'Schema',
        description: 'Columns and types for the saved SQL queries table',
        sql: 'PRAGMA table_info(t_sql_queries);',
      },
      {
        name: 'System Settings (t_settings)',
        category: 'Settings',
        description: 'Current configuration settings including update_frequency',
        sql: 'SELECT id, setting_name, setting_value FROM t_settings ORDER BY id ASC;',
      },
      {
        name: 'All Saved Queries (t_sql_queries)',
        category: 'Settings',
        description: 'Lists all stored queries in t_sql_queries',
        sql: 'SELECT id, name, category, description, sql_text, updated_at FROM t_sql_queries ORDER BY category, name;',
      },
    ];

    for (const d of defaults) {
      this.db.run(
        `INSERT INTO t_sql_queries (name, description, sql_text, category, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [d.name, d.description, d.sql, d.category, nowIso, nowIso]
      );
    }
  }

  // Settings operations
  public async getSetting(name: string, defaultValue?: string): Promise<string | null> {
    await this.initialize();
    const rows = await this.query<{ setting_value: string }>(
      'SELECT setting_value FROM t_settings WHERE setting_name = ?',
      [name]
    );
    if (rows.length > 0) {
      return rows[0].setting_value;
    }
    return defaultValue ?? null;
  }

  public async setSetting(name: string, value: string): Promise<void> {
    await this.initialize();
    await this.run(
      `INSERT INTO t_settings (setting_name, setting_value)
       VALUES (?, ?)
       ON CONFLICT(setting_name) DO UPDATE SET setting_value = excluded.setting_value`,
      [name, value]
    );
  }

  public async getAllSettings(): Promise<SettingRecord[]> {
    await this.initialize();
    return this.query<SettingRecord>('SELECT id, setting_name, setting_value FROM t_settings ORDER BY id ASC');
  }

  // SQL Queries operations
  public async getSavedQueries(): Promise<SqlQueryRecord[]> {
    await this.initialize();
    return this.query<SqlQueryRecord>(
      'SELECT id, name, description, sql_text, category, created_at, updated_at FROM t_sql_queries ORDER BY category ASC, name ASC'
    );
  }

  public async saveQuery(query: {
    id?: number;
    name: string;
    description?: string;
    sql_text: string;
    category?: string;
  }): Promise<number> {
    await this.initialize();
    const nowIso = new Date().toISOString();
    if (query.id) {
      await this.run(
        `UPDATE t_sql_queries SET name = ?, description = ?, sql_text = ?, category = ?, updated_at = ? WHERE id = ?`,
        [
          query.name,
          query.description || '',
          query.sql_text,
          query.category || 'General',
          nowIso,
          query.id,
        ]
      );
      return query.id;
    } else {
      await this.run(
        `INSERT INTO t_sql_queries (name, description, sql_text, category, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          query.name,
          query.description || '',
          query.sql_text,
          query.category || 'General',
          nowIso,
          nowIso,
        ]
      );
      const res = await this.query<{ id: number }>('SELECT last_insert_rowid() AS id');
      return res[0]?.id || 0;
    }
  }

  public async deleteQuery(id: number): Promise<void> {
    await this.initialize();
    await this.run('DELETE FROM t_sql_queries WHERE id = ?', [id]);
  }

  public async resetDefaultQueries(): Promise<void> {
    await this.initialize();
    await this.run('DELETE FROM t_sql_queries');
    this.seedPresetQueries();
    await this.persistToLocalCache();
    this.notifyChange();
  }

  /**
   * Introspect database tables and columns with row counts for IDE schema tree
   */
  public async getDatabaseSchema(): Promise<TableSchemaInfo[]> {
    await this.initialize();
    return this.mutex.lock(async () => {
      if (!this.db) return [];
      try {
        const tablesRes = this.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;");
        if (!tablesRes.length || !tablesRes[0].values.length) return [];

        const result: TableSchemaInfo[] = [];
        for (const row of tablesRes[0].values) {
          const tableName = String(row[0]);
          const colRes = this.db.exec(`PRAGMA table_info("${tableName}");`);
          const columns: ColumnSchemaInfo[] = [];
          if (colRes.length && colRes[0].values) {
            for (const col of colRes[0].values) {
              columns.push({
                cid: Number(col[0]),
                name: String(col[1]),
                type: String(col[2] || 'TEXT'),
                notnull: Number(col[3]),
                dflt_value: col[4],
                pk: Number(col[5]),
              });
            }
          }

          let rowCount = 0;
          try {
            const countRes = this.db.exec(`SELECT COUNT(*) as count FROM "${tableName}";`);
            if (countRes.length && countRes[0].values.length) {
              rowCount = Number(countRes[0].values[0][0]) || 0;
            }
          } catch {
            // ignore
          }

          result.push({
            name: tableName,
            rowCount,
            columns,
          });
        }
        return result;
      } catch (err) {
        console.error('Failed to introspect schema:', err);
        return [];
      }
    });
  }
}

export const dbService = DatabaseService.getInstance();
