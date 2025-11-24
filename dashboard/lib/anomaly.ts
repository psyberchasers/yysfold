const BASELINE_DENSITY = 1.1e6;

export function computeAnomalyScore(hotzones: Array<{ density?: number }> = []) {
  if (!hotzones || hotzones.length === 0) {
    return { score: 0.95, label: 'No zones', similarity: 5 };
  }
  const peak = hotzones.reduce((max, zone) => Math.max(max, Number(zone?.density ?? 0)), 0);
  if (!Number.isFinite(peak) || peak <= 0) {
    return { score: 0.9, label: 'No density', similarity: 10 };
  }
  const normalized = Math.min(1, peak / BASELINE_DENSITY);
  const score = Number((1 - normalized).toFixed(2));
  let label = 'Typical';
  if (score >= 0.7) label = 'Rare';
  else if (score >= 0.4) label = 'Unusual';
  const similarity = Math.max(0, Math.min(100, Math.round((1 - score) * 100)));
  return { score, label, similarity };
}

