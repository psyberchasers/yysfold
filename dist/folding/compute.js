import { vectorizeBlock } from './vectorize.js';
import { foldVectors } from './fold.js';
import { pqEncode } from './pq.js';
import { hashFoldedBlock, hashPQCode } from './commit.js';
export function computeFoldedBlock(raw, codebook, options = {}) {
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
