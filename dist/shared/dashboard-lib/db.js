import { existsSync } from 'node:fs';
import path from 'node:path';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Database = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let metricsDb = null;
// Dynamic require to avoid build errors when better-sqlite3 isn't available (e.g., Vercel)
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Database = require('better-sqlite3');
}
catch {
    // better-sqlite3 not available - dashboard will use API instead
}
export function getDatabase() {
    if (db)
        return db;
    if (!Database) {
        throw new Error('SQLite not available. Use DATA_API_URL to fetch from API instead.');
    }
    const dataDir = process.env.DATA_DIR ?? path.resolve('..', 'artifacts');
    const dbPath = path.join(dataDir, 'index.db');
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    return db;
}
export function getMetricsDatabase() {
    if (metricsDb)
        return metricsDb;
    if (!Database) {
        throw new Error('SQLite not available. Use DATA_API_URL to fetch from API instead.');
    }
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
