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
        blockHash: raw.header.hash ?? '',
        txRoot: raw.header.txRoot ?? '',
        stateRoot: raw.header.stateRoot ?? '',
        headerRlp: raw.header.headerRlp,
    };
}
export async function proveFoldedBlock(raw, artifact, codebook, params, backend) {
    const witness = buildCircuitWitness(raw, artifact, codebook);
    const publicInputs = buildPublicInputs({
        prevStateRoot: raw.header.parentHash ?? '',
        newStateRoot: raw.header.stateRoot ?? '',
        blockHeight: raw.header.height,
        txMerkleRoot: raw.header.txRoot ?? '',
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
