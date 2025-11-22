import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createSeededRandom } from '../utils/random.js';
const DEFAULT_SCALE = 1;
export function createDeterministicCodebook(params) {
    const { numSubspaces, subvectorDim, numCentroids, seed = 'yysfold-codebook', scale = DEFAULT_SCALE } = params;
    if (numSubspaces <= 0 || subvectorDim <= 0 || numCentroids <= 0) {
        throw new Error('Codebook dimensions must be positive');
    }
    const rand = createSeededRandom(seed);
    const centroids = Array.from({ length: numSubspaces }, () => Array.from({ length: numCentroids }, () => Array.from({ length: subvectorDim }, () => (rand() * 2 - 1) * scale)));
    return {
        centroids,
        subvectorDim,
        numCentroids,
        numSubspaces,
    };
}
export function assertCodebookConsistency(codebook) {
    if (codebook.centroids.length !== codebook.numSubspaces) {
        throw new Error('Mismatch between numSubspaces and centroids length');
    }
    codebook.centroids.forEach((subspace, subspaceIdx) => {
        if (subspace.length !== codebook.numCentroids) {
            throw new Error(`Codebook subspace ${subspaceIdx} has inconsistent centroid count`);
        }
        subspace.forEach((centroid, centroidIdx) => {
            if (centroid.length !== codebook.subvectorDim) {
                throw new Error(`Centroid ${centroidIdx} in subspace ${subspaceIdx} has wrong dimension`);
            }
        });
    });
}
export function loadCodebookFromFile(path) {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    const codebook = raw.codebook ?? raw;
    assertCodebookConsistency(codebook);
    return codebook;
}
export function saveCodebookToFile(path, codebook, metadata) {
    assertCodebookConsistency(codebook);
    const payload = metadata ? { metadata, codebook } : codebook;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(payload, null, 2), 'utf-8');
}
