const DEFAULT_OPTIONS = {
    errorBound: 0.25,
    strict: false,
};
export function pqEncode(folded, codebook, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const indices = folded.foldedVectors.map((vector) => encodeVector(vector, codebook));
    if (opts.errorBound > 0) {
        enforceErrorBound(folded.foldedVectors, indices, codebook, opts.errorBound, opts.strict);
    }
    return { indices };
}
export function pqDecode(code, codebook) {
    return code.indices.map((subspaceIndices) => reconstructVector(subspaceIndices, codebook));
}
function encodeVector(vector, codebook) {
    const subvectors = splitIntoSubvectors(vector, codebook.subvectorDim);
    return subvectors.map((subvector, subspaceIdx) => {
        const centroidIndex = findClosestCentroid(subvector, codebook.centroids[subspaceIdx]);
        return centroidIndex;
    });
}
function enforceErrorBound(originalVectors, codeIndices, codebook, errorBound, strict) {
    for (let i = 0; i < originalVectors.length; i += 1) {
        const reconstructed = reconstructVector(codeIndices[i], codebook);
        const error = computeError(padVector(originalVectors[i], reconstructed.length), reconstructed);
        if (error > errorBound) {
            const message = `PQ encode error ${error.toFixed(6)} exceeds bound ${errorBound}`;
            if (strict) {
                throw new Error(message);
            }
            else {
                // eslint-disable-next-line no-console
                console.warn(message);
            }
        }
    }
}
function padVector(vector, length) {
    if (vector.length >= length) {
        return vector.slice(0, length);
    }
    return [...vector, ...new Array(length - vector.length).fill(0)];
}
function reconstructVector(subspaceIndices, codebook) {
    const parts = subspaceIndices.map((centroidIndex, subspaceIdx) => {
        const centroids = codebook.centroids[subspaceIdx];
        return centroids?.[centroidIndex] ?? new Array(codebook.subvectorDim).fill(0);
    });
    return parts.flat();
}
function splitIntoSubvectors(vector, subvectorDim) {
    const parts = [];
    for (let i = 0; i < vector.length; i += subvectorDim) {
        const slice = vector.slice(i, i + subvectorDim);
        if (slice.length < subvectorDim) {
            slice.push(...new Array(subvectorDim - slice.length).fill(0));
        }
        parts.push(slice);
    }
    return parts;
}
function findClosestCentroid(subvector, centroids) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    centroids.forEach((centroid, index) => {
        const distance = computeError(subvector, centroid);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
        }
    });
    return bestIndex;
}
function computeError(vectorA, vectorB) {
    let sum = 0;
    for (let i = 0; i < vectorA.length; i += 1) {
        const diff = (vectorA[i] ?? 0) - (vectorB[i] ?? 0);
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}
