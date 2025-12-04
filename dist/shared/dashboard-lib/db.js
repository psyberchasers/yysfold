import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import path from 'node:path';
let db = null;
let metricsDb = null;
export function getDatabase() {
    if (db)
        return db;
    const dataDir = process.env.DATA_DIR ?? path.resolve('..', 'artifacts');
    const dbPath = path.join(dataDir, 'index.db');
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    return db;
}
export function getMetricsDatabase() {
    if (metricsDb)
        return metricsDb;
    const dataDir = process.env.DATA_DIR ?? path.resolve('..', 'artifacts');
    const dbPath = path.join(dataDir, 'telemetry.db');
    if (!existsSync(dbPath)) {
        metricsDb = new Database(':memory:');
        metricsDb.exec(`
      CREATE TABLE IF NOT EXISTS block_metrics (
        chain TEXT NOT NULL,
        height INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        hotzone_count INTEGER NOT NULL,
        peak_density REAL NOT NULL,
        avg_density REAL NOT NULL,
        tags TEXT NOT NULL
      );
    `);
        return metricsDb;
    }
    metricsDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    return metricsDb;
}
