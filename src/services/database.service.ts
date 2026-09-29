/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { get, set } from 'idb-keyval';
import { AsyncMutex } from './mutex';
import { ActivityRecord, PEMRecord, QueryExecutionResult } from '../types/database.types';

const IDB_KEY_SQLITE_DATA = 'pem_sqlite_database_bin';
const IDB_KEY_UPDATED_AT = 'pem_sqlite_updated_at';

export type DatabaseChangeListener = () => void;

export class DatabaseService {
  private static instance: DatabaseService;
  private db: Database | null = null;
  private SQL: SqlJsStatic | null = null;
  private mutex = new AsyncMutex();
  private isInitialized = false;
  private changeListeners: Set<DatabaseChangeListener> = new Set();
  private lastModifiedTimestamp: number = Date.now();

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

      // Ensure required tables exist
      await this.ensureSchema();

      // Check if seeded data exists, if not, provide realistic chronic illness pacing records
      await this.seedInitialRecordsIfEmpty();

      // Persist to local cache
      await this.persistToLocalCache();

      this.isInitialized = true;
    });
  }

  /**
   * Abstracted schema initialization to guarantee t_pems and t_activities exist
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
        brain_fog REAL DEFAULT 0
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
        end_peak REAL DEFAULT 0
      );
    `);
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
      // Create records spanning the past 5 days
      const now = new Date();
      const formatIso = (d: Date) => d.toISOString().replace('T', ' ').substring(0, 19);

      // Day -4: Safe baseline day
      const d4 = new Date(now.getTime() - 4 * 24 * 3600 * 1000);
      this.db.run(`
        INSERT INTO t_activities (activity_date, activity_name, duration, start_steps, end_steps, start_calories, end_calories, start_moderate, end_moderate, start_vigorous, end_vigorous, start_peak, end_peak)
        VALUES ('${formatIso(d4)}', 'Morning Light Stretch & Paced Breaths', 20, 120, 310, 1420, 1485, 0, 8, 0, 0, 0, 0);
      `);
      this.db.run(`
        INSERT INTO t_pems (pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog)
        VALUES ('${formatIso(d4)}', 1.5, 3.0, 1.0, 2.0, 2.5);
      `);

      // Day -3: Over-exertion trigger day (doctor visit & stairs)
      const d3 = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
      this.db.run(`
        INSERT INTO t_activities (activity_date, activity_name, duration, start_steps, end_steps, start_calories, end_calories, start_moderate, end_moderate, start_vigorous, end_vigorous, start_peak, end_peak)
        VALUES ('${formatIso(d3)}', 'Clinic Appointment & Stair Walk (High Heart Rate)', 75, 450, 3420, 1510, 1920, 8, 42, 0, 18, 0, 4);
      `);
      this.db.run(`
        INSERT INTO t_pems (pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog)
        VALUES ('${formatIso(d3)}', 2.0, 4.5, 2.0, 3.5, 3.0);
      `);

      // Day -2: PEM Crash Lag (24h post-exertion peak crash)
      const d2 = new Date(now.getTime() - 2 * 24 * 3600 * 1000);
      this.db.run(`
        INSERT INTO t_activities (activity_date, activity_name, duration, start_steps, end_steps, start_calories, end_calories, start_moderate, end_moderate, start_vigorous, end_vigorous, start_peak, end_peak)
        VALUES ('${formatIso(d2)}', 'Horizontal Bed Rest & Sensory Deprivation', 180, 20, 140, 1380, 1410, 0, 0, 0, 0, 0, 0);
      `);
      this.db.run(`
        INSERT INTO t_pems (pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog)
        VALUES ('${formatIso(d2)}', 7.5, 8.8, 6.5, 8.2, 8.0);
      `);

      // Day -1: Recovery & Stabilizing
      const d1 = new Date(now.getTime() - 1 * 24 * 3600 * 1000);
      this.db.run(`
        INSERT INTO t_activities (activity_date, activity_name, duration, start_steps, end_steps, start_calories, end_calories, start_moderate, end_moderate, start_vigorous, end_vigorous, start_peak, end_peak)
        VALUES ('${formatIso(d1)}', 'Gentle Kitchen Meal Prep & Chair Rest', 30, 210, 680, 1440, 1530, 0, 12, 0, 0, 0, 0);
      `);
      this.db.run(`
        INSERT INTO t_pems (pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog)
        VALUES ('${formatIso(d1)}', 4.0, 6.2, 3.5, 5.0, 5.2);
      `);

      // Today
      this.db.run(`
        INSERT INTO t_activities (activity_date, activity_name, duration, start_steps, end_steps, start_calories, end_calories, start_moderate, end_moderate, start_vigorous, end_vigorous, start_peak, end_peak)
        VALUES ('${formatIso(now)}', 'Mid-Day Pacing Checkpoint & Cognitive Rest', 25, 340, 560, 1400, 1460, 0, 5, 0, 0, 0, 0);
      `);
      this.db.run(`
        INSERT INTO t_pems (pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog)
        VALUES ('${formatIso(now)}', 2.5, 4.8, 2.0, 3.8, 3.5);
      `);
    }
  }

  /**
   * Persists database binary to client-side IndexedDB cache
   */
  public async persistToLocalCache(): Promise<void> {
    if (!this.db) return;
    try {
      const data = this.db.export();
      const now = Date.now();
      await set(IDB_KEY_SQLITE_DATA, data);
      await set(IDB_KEY_UPDATED_AT, now);
      this.lastModifiedTimestamp = now;
    } catch (e) {
      console.error('Failed to persist to IndexedDB:', e);
    }
  }

  /**
   * Abstracted Thread-Safe Query Execution
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
      
      // Auto-save to IndexedDB local cache after mutations
      await this.persistToLocalCache();
      this.notifyChange();
      return { changes };
    });
  }

  /**
   * Run raw SQL command with detailed timing and tabular results (used by SQL Query Console Plugin)
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
   * Replace the active SQLite database with remote pCloud or imported binary data
   */
  public async loadDatabaseBinary(binaryData: Uint8Array): Promise<void> {
    await this.initialize();
    return this.mutex.lock(async () => {
      if (!this.SQL) throw new Error('SQL engine not ready');
      
      this.db = new this.SQL.Database(binaryData);
      await this.ensureSchema();
      await this.persistToLocalCache();
      this.notifyChange();
    });
  }

  /**
   * Reset / Clean database
   */
  public async resetDatabase(): Promise<void> {
    return this.mutex.lock(async () => {
      if (!this.SQL) throw new Error('SQL engine not ready');
      this.db = new this.SQL.Database();
      await this.ensureSchema();
      await this.seedInitialRecordsIfEmpty();
      await this.persistToLocalCache();
      this.notifyChange();
    });
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
    await this.run(
      `INSERT INTO t_pems (pem_date, headache, fatigue, eye_stinging, general_malaise, brain_fog)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        pem.pem_date,
        pem.headache,
        pem.fatigue,
        pem.eye_stinging,
        pem.general_malaise,
        pem.brain_fog,
      ]
    );
  }

  public async deletePEM(id: number): Promise<void> {
    await this.run('DELETE FROM t_pems WHERE id = ?', [id]);
  }

  public async insertActivity(act: Omit<ActivityRecord, 'id'>): Promise<void> {
    await this.run(
      `INSERT INTO t_activities (
        activity_date, activity_name, duration,
        start_steps, end_steps,
        start_calories, end_calories,
        start_moderate, end_moderate,
        start_vigorous, end_vigorous,
        start_peak, end_peak
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ]
    );
  }

  public async deleteActivity(id: number): Promise<void> {
    await this.run('DELETE FROM t_activities WHERE id = ?', [id]);
  }
}

export const dbService = DatabaseService.getInstance();
