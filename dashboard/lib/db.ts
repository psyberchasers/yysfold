import Database from 'better-sqlite3';
import path from 'node:path';

let db: Database.Database | null = null;

export function getDatabase() {
  if (db) return db;
  const dataDir = process.env.DATA_DIR ?? path.resolve('..', 'artifacts');
  const dbPath = path.join(dataDir, 'index.db');
  db = new Database(dbPath, { readonly: true, fileMustExist: true });
  return db;
}

