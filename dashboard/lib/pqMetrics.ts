import type Database from 'better-sqlite3';
import { getMetricsDatabase } from './db';
import { summarizeResiduals, type ResidualStats } from '../../analytics/residuals';

export interface HistogramBin {
  start: number;
  end: number;
  count: number;
}

export interface PQHistogramResult {
  bins: HistogramBin[];
  stats: ResidualStats;
  totalCount: number;
  bucketSize: number;
  threshold: number;
  range: {
    from: number;
    to: number;
  };
}

export interface PQHistogramOptions {
  chain?: string;
  from?: number;
  to?: number;
  bucketCount?: number;
  threshold?: number;
}

export function queryPQResidualHistogram(options: PQHistogramOptions = {}): PQHistogramResult {
  const db = getMetricsDatabase();
  const now = Math.floor(Date.now() / 1000);
  const from = options.from ?? now - 24 * 60 * 60;
  const to = options.to ?? now;
  const bucketCount = Math.max(5, Math.min(60, options.bucketCount ?? 24));
  const threshold = options.threshold ?? 0.25;
  const values = fetchResiduals(db, { from, to, chain: options.chain });
  const stats = summarizeResiduals(values);
  const totalCount = values.length;
  const maxValue = Math.max(stats.max, threshold, 0.05);
  const bucketSize = Math.max(maxValue / bucketCount, 0.01);
  const bins = Array.from({ length: bucketCount }, (_, index) => ({
    start: index * bucketSize,
    end: (index + 1) * bucketSize,
    count: 0,
  }));
  values.forEach((value) => {
    const idx = Math.min(Math.floor(value / bucketSize), bucketCount - 1);
    bins[idx].count += 1;
  });
  return {
    bins,
    stats,
    totalCount,
    bucketSize,
    threshold,
    range: { from, to },
  };
}

function fetchResiduals(
  db: Database.Database,
  filters: { from: number; to: number; chain?: string },
): number[] {
  const baseSql = `
    SELECT residual
    FROM pq_residual_samples
    WHERE timestamp >= ? AND timestamp <= ?
    ${filters.chain ? 'AND chain = ?' : ''}
  `;
  const stmt = db.prepare(baseSql);
  const rows = filters.chain ? stmt.all(filters.from, filters.to, filters.chain) : stmt.all(filters.from, filters.to);
  return rows
    .map((row: { residual: number }) => Number(row.residual ?? 0))
    .filter((value) => Number.isFinite(value) && value >= 0);
}

