import { readFileSync } from 'node:fs';
export function loadComponentMatrix(dimension, components, options = {}) {
    if (options.path) {
        return loadFromPath(options.path, dimension, components);
    }
    return {
        version: options.version ?? `dct-v1-${components}x${dimension}`,
        weights: buildDeterministicDctMatrix(dimension, components),
    };
}
function loadFromPath(path, dimension, components) {
    const raw = JSON.parse(readFileSync(path, 'utf-8'));
    validateMatrix(raw.weights, dimension, components, path);
    return raw;
}
export function buildDeterministicDctMatrix(dimension, components) {
    const matrix = [];
    for (let k = 0; k < components; k += 1) {
        const row = [];
        const alpha = k === 0 ? Math.sqrt(1 / dimension) : Math.sqrt(2 / dimension);
        for (let n = 0; n < dimension; n += 1) {
            const value = alpha * Math.cos(((Math.PI * (2 * n + 1) * k) / (2 * dimension)));
            row.push(value);
        }
        matrix.push(row);
    }
    return matrix;
}
export function validateMatrix(matrix, dimension, components, label = 'component matrix') {
    if (matrix.length !== components) {
        throw new Error(`${label}: expected ${components} rows, found ${matrix.length}`);
    }
    matrix.forEach((row, rowIdx) => {
        if (row.length !== dimension) {
            throw new Error(`${label}: row ${rowIdx} expected length ${dimension}, found ${row.length}`);
        }
    });
}
