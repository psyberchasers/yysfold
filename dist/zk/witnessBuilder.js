import { blake3 } from '@noble/hashes/blake3';
import { pqDecode } from '../folding/pq.js';
import { buildPublicInputs } from './publicInputs.js';
export function buildCircuitWitness(raw, artifact, codebook) {
    const pqVectors = pqDecode(artifact.pqCode, codebook);
    return {
        transactions: raw.transactions,
        executionTraces: raw.executionTraces,
        witnessData: raw.witnessData,
        foldedVectors: artifact.foldedBlock.foldedVectors,
        pqIndices: artifact.pqCode.indices,
        pqVectors,
    };
}
export async function proveFoldedBlock(raw, artifact, codebook, params, backend) {
    const witness = buildCircuitWitness(raw, artifact, codebook);
    const txMerkleRoot = raw.header.txMerkleRoot ?? deriveTxMerkleRoot(raw);
    const publicInputs = buildPublicInputs({
        prevStateRoot: raw.header.prevStateRoot,
        newStateRoot: raw.header.newStateRoot,
        blockHeight: raw.header.height,
        txMerkleRoot,
        commitments: artifact.commitments,
        codebookRoot: params.codebookRoot,
    });
    const proofBytes = await backend.prove({ witness, publicInputs, params });
    return {
        proofBytes,
        publicInputs,
    };
}
export async function verifyFoldedBlock(proof, params, backend) {
    return backend.verify({ proof, params });
}
function deriveTxMerkleRoot(raw) {
    const payload = JSON.stringify(raw.transactions);
    return Buffer.from(blake3(Buffer.from(payload))).toString('hex');
}
