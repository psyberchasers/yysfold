import { blake3 } from '@noble/hashes/blake3';
export function hashFoldedBlock(block) {
    const payload = JSON.stringify(block.foldedVectors);
    return toHex(blake3(Buffer.from(payload)));
}
export function hashPQCode(code) {
    const payload = JSON.stringify(code.indices);
    return toHex(blake3(Buffer.from(payload)));
}
export function hashCodebookRoot(centroids) {
    const payload = JSON.stringify(centroids);
    return toHex(blake3(Buffer.from(payload)));
}
function toHex(bytes) {
    return Buffer.from(bytes).toString('hex');
}
