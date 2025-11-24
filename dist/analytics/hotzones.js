import { pqDecode } from '../folding/pq.js';
const DEFAULT_OPTIONS = {
    bandwidth: 0.15,
    threshold: 0.02,
    maxZones: 16,
    contextTags: [],
};
const CONTEXTUAL_TAGS = [
    'AML_ALERT',
    'AML_RULE',
    'DEX_ACTIVITY',
    'NFT_ACTIVITY',
    'HIGH_FEE',
    'LENDING_ACTIVITY',
    'BRIDGE_ACTIVITY',
    'MEV_ACTIVITY',
    'LARGE_VALUE',
];
export function detectHotzones(code, codebook, options = {}) {
    const opts = {
        ...DEFAULT_OPTIONS,
        ...options,
        contextTags: options.contextTags ?? DEFAULT_OPTIONS.contextTags,
    };
    const vectors = pqDecode(code, codebook);
    const densities = vectors.map((vector, index) => ({
        index,
        density: kernelDensity(vector, vectors, opts.bandwidth),
    }));
    const sorted = densities.filter((entry) => entry.density >= opts.threshold).sort((a, b) => b.density - a.density);
    const selected = sorted.slice(0, opts.maxZones);
    return selected.map((entry, i) => ({
        id: `hotzone-${i}`,
        center: vectors[entry.index],
        density: entry.density,
        radius: opts.bandwidth * 2,
        semanticTags: enrichSemanticTags(deriveSemanticTags(vectors[entry.index]), opts.contextTags ?? []),
    }));
}
function kernelDensity(target, vectors, bandwidth) {
    const denom = Math.pow(Math.sqrt(2 * Math.PI) * bandwidth, target.length);
    const sum = vectors.reduce((acc, vector) => acc + gaussianKernel(distance(target, vector), bandwidth), 0);
    return sum / (vectors.length * denom);
}
function gaussianKernel(dist, bandwidth) {
    const scaled = dist / bandwidth;
    return Math.exp(-0.5 * scaled * scaled);
}
function distance(a, b) {
    let sum = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
        const diff = (a[i] ?? 0) - (b[i] ?? 0);
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}
function deriveSemanticTags(vector) {
    const tags = new Set();
    const get = (index) => vector[index] ?? 0;
    if (get(0) > 0.65)
        tags.add('HIGH_VALUE');
    if (get(1) > 0.55)
        tags.add('FEE_INTENSIVE');
    if (get(2) > 0.55)
        tags.add('DEX_ACTIVITY');
    if (get(3) > 0.55)
        tags.add('NFT_ACTIVITY');
    if (get(4) > 0.45)
        tags.add('BRIDGE_ACTIVITY');
    if (get(5) > 0.5)
        tags.add('TIME_CLUSTER');
    if (get(6) > 0.5)
        tags.add('LENDING_ACTIVITY');
    if (get(7) > 0.5)
        tags.add('AML_ALERT');
    if (get(8) > 0.55)
        tags.add('MEV_ACTIVITY');
    if (get(9) < -0.45)
        tags.add('VOLATILITY_CRUSH');
    if (tags.size === 0)
        tags.add('MIXED_ACTIVITY');
    return Array.from(tags);
}
function enrichSemanticTags(base, contextTags) {
    const contextualMatches = contextTags
        .filter((tag) => CONTEXTUAL_TAGS.some((signal) => tag.toUpperCase().includes(signal)))
        .slice(0, 3);
    return Array.from(new Set([...base, ...contextualMatches]));
}
