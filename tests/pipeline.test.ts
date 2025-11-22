import { describe, it, expect } from 'vitest';
import { generateMockBlock } from '../fixtures/mockBlock.js';
import { vectorizeBlock } from '../folding/vectorize.js';
import { foldVectors } from '../folding/fold.js';
import { createDeterministicCodebook, assertCodebookConsistency } from '../folding/codebook.js';
import { pqEncode, pqDecode } from '../folding/pq.js';

describe('vectorize → fold → PQ pipeline', () => {
  it('vectorizes blocks into fixed-dimension embeddings', () => {
    const block = generateMockBlock({ txCount: 4, tracesPerTx: 1, witnessBundles: 2, seed: 'vectorize-test' });
    const vectorized = vectorizeBlock(block);

    expect(vectorized.txVectors).toHaveLength(4);
    vectorized.txVectors.forEach((vec) => expect(vec).toHaveLength(16));

    expect(vectorized.stateVectors.length).toBe(block.executionTraces.length);
    vectorized.stateVectors.forEach((vec) => expect(vec).toHaveLength(12));

    expect(vectorized.witnessVectors.length).toBe(2);
    vectorized.witnessVectors.forEach((vec) => expect(vec).toHaveLength(8));
  });

  it('folds canonical vectors into block-level summaries with metadata', () => {
    const block = generateMockBlock({ txCount: 5, tracesPerTx: 2, witnessBundles: 1, seed: 'fold-test' });
    const vectorized = vectorizeBlock(block);
    const folded = foldVectors(vectorized, { numComponents: 3, foldDim: 12 }, { blockHeight: block.header.height });

    expect(folded.foldedVectors.length).toBe(2 + 3);
    folded.foldedVectors.forEach((vec) => expect(vec).toHaveLength(12));

    expect(folded.metadata.blockHeight).toBe(block.header.height);
    expect(folded.metadata.txCount).toBe(block.transactions.length);
  });

  it('round-trips folded vectors through PQ encode/decode within tolerance', () => {
    const block = generateMockBlock({ txCount: 3, tracesPerTx: 1, seed: 'pq-test' });
    const vectorized = vectorizeBlock(block, { txDim: 8 });
    const folded = foldVectors(vectorized, { numComponents: 2, foldDim: 8 });

    const codebook = createDeterministicCodebook({
      numSubspaces: 4,
      subvectorDim: 2,
      numCentroids: 32,
      seed: 'pq-test-codebook',
      scale: 0.5,
    });
    assertCodebookConsistency(codebook);

    const pqCode = pqEncode(folded, codebook, { errorBound: 0.75, strict: true });
    const decoded = pqDecode(pqCode, codebook);

    expect(decoded).toHaveLength(folded.foldedVectors.length);
    decoded.forEach((vec, idx) => {
      expect(vec).toHaveLength(folded.foldedVectors[idx].length);
      const distance = l2Distance(vec, folded.foldedVectors[idx]);
      expect(distance).toBeLessThanOrEqual(5);
    });
  });
});

function l2Distance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

