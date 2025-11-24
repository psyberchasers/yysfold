import { blake3 } from '@noble/hashes/blake3';
export function hashFoldedBlock(block) {
    const payload = JSON.stringify(block.foldedVectors);
    return toHex(blake3(Buffer.from(payload)));
}
export function hashPQCode(code) {
    const payload = JSON.stringify(code.indices);
    return toHex(blake3(Buffer.from(payload)));
}
export function hashCodebookRoot(input) {
    const payload = Array.isArray(input)
        ? JSON.stringify({ centroids: input })
        : JSON.stringify({
            centroids: input.centroids,
            normalization: input.normalization,
            errorBound: input.errorBound,
        });
    return toHex(blake3(Buffer.from(payload)));
}
function toHex(bytes) {
    return Buffer.from(bytes).toString('hex');
}
