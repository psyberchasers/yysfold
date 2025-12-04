const BASELINE_DENSITY = 1.1e6;

export interface AnomalyInputs {
  hotzones?: Array<{ density?: number }>;
  pqResidualStats?: { average?: number; p95?: number; max?: number };
  tagVector?: string[];
}

const TAG_PRIORS = new Map<string, number>([
  ['AML_ALERT', 0.8],
  ['AML_RULE', 0.7],
  ['HIGH_FEE', 0.6],
  ['VOL_CRUSH', 0.5],
  ['DEX_ACTIVITY', 0.3],
  ['NFT_ACTIVITY', 0.35],
  ['BRIDGE_ACTIVITY', 0.45],
  ['LENDING_ACTIVITY', 0.4],
]);

export function computeAnomalyScore({
  hotzones = [],
  pqResidualStats,
  tagVector = [],
}: AnomalyInputs = {}) {
  const densityComponent = computeDensityComponent(hotzones);
  const residualComponent = computeResidualComponent(pqResidualStats);
  const tagComponent = computeTagComponent(tagVector);

  const scoreRaw =
    0.5 * densityComponent.component +
    0.35 * residualComponent.component +
    0.15 * tagComponent.component;

  const score = Number(Math.min(1, Math.max(0, scoreRaw)).toFixed(2));
  const label = labelFromScore(score);
  const similarity = Math.max(0, Math.min(100, Math.round((1 - score) * 100)));

  return {
    score,
    label,
    similarity,
    breakdown: {
      density: densityComponent,
      pqResidual: residualComponent,
      tags: tagComponent,
    },
  };
}

function computeDensityComponent(hotzones: Array<{ density?: number }> = []) {
  if (!hotzones.length) {
    return { component: 0.85, detail: 'No zones' };
  }
  const peak = hotzones.reduce((max, zone) => Math.max(max, Number(zone?.density ?? 0)), 0);
  if (!Number.isFinite(peak) || peak <= 0) {
    return { component: 0.8, detail: 'Zero density' };
  }
  const normalized = Math.min(1, peak / BASELINE_DENSITY);
  return {
    component: 1 - normalized,
    detail: peak.toFixed(2),
  };
}

function computeResidualComponent(stats?: { average?: number; p95?: number; max?: number }) {
  if (!stats || !Number.isFinite(stats.p95 ?? NaN)) {
    return { component: 0.2, detail: 'n/a' };
  }
  const p95 = Number(stats.p95 ?? 0);
  const normalized = Math.min(1, Math.max(0, p95 / 0.5));
  return {
    component: normalized,
    detail: p95.toFixed(3),
  };
}

function computeTagComponent(tags: string[] = []) {
  if (!tags.length) return { component: 0, detail: 'No tags' };
  const weight = tags.reduce((acc, tag) => acc + (TAG_PRIORS.get(tag.toUpperCase()) ?? 0), 0);
  const normalized = Math.min(1, weight / 3);
  return { component: normalized, detail: `${(normalized * 100).toFixed(0)}%` };
}

function labelFromScore(score: number) {
  if (score >= 0.75) return 'Rare';
  if (score >= 0.45) return 'Unusual';
  return 'Typical';
}

