import { hashCodebookRoot, hashPQCode } from '../folding/commit.js';
export function buildPublicInputs(args) {
    return {
        prevStateRoot: args.prevStateRoot,
        newStateRoot: args.newStateRoot,
        blockHeight: args.blockHeight,
        txMerkleRoot: args.txMerkleRoot,
        foldedCommitment: args.commitments.foldedCommitment,
        pqCommitment: args.commitments.pqCommitment,
        codebookRoot: args.codebookRoot,
    };
}
export function buildCodebookCommitment(codebook) {
    return hashCodebookRoot(codebook.centroids);
}
export function buildPQCommitments(pqCode) {
    return hashPQCode(pqCode);
}
