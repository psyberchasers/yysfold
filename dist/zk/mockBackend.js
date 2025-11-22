import { blake3 } from '@noble/hashes/blake3';
export function createMockBackend() {
    return {
        prove: async ({ witness, publicInputs }) => {
            const payload = JSON.stringify({ witness, publicInputs });
            return blake3(Buffer.from(payload));
        },
        verify: async ({ proof }) => {
            return proof.proofBytes.length > 0;
        },
    };
}
