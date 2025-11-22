import { pqDecode } from '../folding/pq.js';
const DEFAULT_OPTIONS = {
    bandwidth: 0.15,
    threshold: 0.05,
    maxZones: 8,
};
export function detectHotzones(code, codebook, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
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
        semanticTags: deriveSemanticTags(vectors[entry.index]),
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
    const tags = [];
    if ((vector[0] ?? 0) > 0.7)
        tags.push('HIGH_VALUE');
    if ((vector[1] ?? 0) > 0.6)
        tags.push('FEE_INTENSIVE');
    if ((vector[5] ?? 0) > 0.5)
        tags.push('TIME_CLUSTER');
    if (tags.length === 0)
        tags.push('MIXED_ACTIVITY');
    return tags;
}
