import { getMetricsDatabase } from './db.js';
import { summarizeResiduals } from '../../analytics/residuals.js';
export function queryPQResidualHistogram(options = {}) {
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
function fetchResiduals(db, filters) {
    const baseSql = `
    SELECT residual
    FROM pq_residual_samples
    WHERE timestamp >= ? AND timestamp <= ?
    ${filters.chain ? 'AND chain = ?' : ''}
  `;
    const stmt = db.prepare(baseSql);
    const rows = (filters.chain
        ? stmt.all(filters.from, filters.to, filters.chain)
        : stmt.all(filters.from, filters.to));
    return rows
        .map((row) => Number(row.residual ?? 0))
        .filter((value) => Number.isFinite(value) && value >= 0);
}
