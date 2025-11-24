import { describe, it, expect } from 'vitest';
import { computeFoldedBlock } from '../compute.js';
import { createDeterministicCodebook } from '../codebook.js';
const SAMPLE_BLOCK = {
    header: {
        height: 123456,
        prevStateRoot: '0xprev',
        newStateRoot: '0xnext',
        timestamp: 1_700_000_000,
        txMerkleRoot: '0xtx',
    },
    transactions: Array.from({ length: 4 }, (_, idx) => ({
        hash: `0xtx${idx}`,
        amount: 1000n * BigInt(idx + 1),
        fee: idx * 10,
        gasUsed: 21_000 + idx,
        gasPrice: 100 + idx,
        nonce: idx,
        status: 'success',
        chainId: 1,
        sender: `0xsender${idx}`,
        receiver: `0xreceiver${idx}`,
        contractType: 'LEGACY',
        dataSize: 0,
    })),
    executionTraces: Array.from({ length: 4 }, (_, idx) => ({
        balanceDelta: idx * 2,
        storageWrites: 1,
        storageReads: 1,
        logEvents: 0,
        contract: `0xcontract${idx}`,
        asset: 'ETH',
        traceType: 'LEGACY',
        gasConsumed: 5_000 + idx,
        slotIndex: idx,
        reverted: false,
    })),
    witnessData: {
        bundles: [
            {
                constraintCount: 4096,
                degree: 1024,
                gateCount: 2048,
                quotientDegree: 4096,
                proverLabel: 'test',
                circuitType: 'AGGREGATION',
            },
        ],
    },
};
const CODEBOOK = createDeterministicCodebook({
    numSubspaces: 4,
    subvectorDim: 4,
    numCentroids: 32,
    seed: 'test-seed',
});
describe('computeFoldedBlock', () => {
    it('produces deterministic results for identical inputs', () => {
        const first = computeFoldedBlock(cloneBlock(SAMPLE_BLOCK), CODEBOOK);
        const second = computeFoldedBlock(cloneBlock(SAMPLE_BLOCK), CODEBOOK);
        expect(first.foldedBlock.foldedVectors).toEqual(second.foldedBlock.foldedVectors);
        expect(first.pqCode.indices).toEqual(second.pqCode.indices);
        expect(first.commitments).toEqual(second.commitments);
    });
    it('changes commitments when block metadata changes', () => {
        const baseline = computeFoldedBlock(cloneBlock(SAMPLE_BLOCK), CODEBOOK);
        const modifiedBlock = cloneBlock(SAMPLE_BLOCK);
        modifiedBlock.transactions.push({
            hash: '0xextra',
            amount: 42,
            fee: 1,
            gasUsed: 21_000,
            gasPrice: 99,
            nonce: 999,
            status: 'success',
            chainId: 1,
            sender: '0xextra',
            receiver: '0xextra-dst',
            contractType: 'LEGACY',
            dataSize: 0,
        });
        modifiedBlock.executionTraces.push({
            balanceDelta: 42,
            storageWrites: 1,
            storageReads: 1,
            logEvents: 0,
            contract: '0xextra',
            asset: 'ETH',
            traceType: 'LEGACY',
            gasConsumed: 10_000,
            slotIndex: 999,
            reverted: false,
        });
        const modified = computeFoldedBlock(modifiedBlock, CODEBOOK);
        expect(modified.commitments.foldedCommitment).not.toEqual(baseline.commitments.foldedCommitment);
        expect(modified.commitments.pqCommitment).not.toEqual(baseline.commitments.pqCommitment);
    });
});
function cloneBlock(block) {
    return JSON.parse(JSON.stringify(block, (_, value) => (typeof value === 'bigint' ? Number(value) : value)));
}
