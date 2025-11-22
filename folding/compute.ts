import { FoldedArtifact, PQCodebook, RawBlock } from './types.js';
import { vectorizeBlock, VectorizeOptions } from './vectorize.js';
import { foldVectors, FoldingOptions } from './fold.js';
import { pqEncode, PQEncodeOptions } from './pq.js';
import { hashFoldedBlock, hashPQCode } from './commit.js';

export interface ComputeFoldedBlockOptions {
  vectorize?: VectorizeOptions;
  folding?: FoldingOptions;
  pq?: PQEncodeOptions;
}

export function computeFoldedBlock(
  raw: RawBlock,
  codebook: PQCodebook,
  options: ComputeFoldedBlockOptions = {},
): FoldedArtifact {
  const vectorized = vectorizeBlock(raw, options.vectorize);
  const foldedBlock = foldVectors(vectorized, options.folding, {
    blockHeight: raw.header.height,
    txCount: raw.transactions.length,
    timestamp: raw.header.timestamp,
  });
  const pqCode = pqEncode(foldedBlock, codebook, options.pq);
  const foldedCommitment = hashFoldedBlock(foldedBlock);
  const pqCommitment = hashPQCode(pqCode);

  return {
    foldedBlock,
    pqCode,
    commitments: {
      foldedCommitment,
      pqCommitment,
    },
  };
}

