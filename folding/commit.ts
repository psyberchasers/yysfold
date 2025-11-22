import { blake3 } from '@noble/hashes/blake3';
import { FoldedBlock, PQCode } from './types.js';

export function hashFoldedBlock(block: FoldedBlock): string {
  const payload = JSON.stringify(block.foldedVectors);
  return toHex(blake3(Buffer.from(payload)));
}

export function hashPQCode(code: PQCode): string {
  const payload = JSON.stringify(code.indices);
  return toHex(blake3(Buffer.from(payload)));
}

export function hashCodebookRoot(centroids: number[][][]): string {
  const payload = JSON.stringify(centroids);
  return toHex(blake3(Buffer.from(payload)));
}

function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

