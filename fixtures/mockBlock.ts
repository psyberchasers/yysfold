import { RawBlock } from '../folding/index.js';
import { hexlify, keccak256, toUtf8Bytes } from 'ethers';
import { createSeededRandom } from '../utils/random.js';

export interface MockBlockOptions {
  txCount?: number;
  tracesPerTx?: number;
  witnessBundles?: number;
  seed?: string;
  startHeight?: number;
  startTimestamp?: number;
}

const DEFAULT_OPTIONS: Required<MockBlockOptions> = {
  txCount: 24,
  tracesPerTx: 2,
  witnessBundles: 3,
  seed: 'yysfold-mock-block',
  startHeight: 10_000,
  startTimestamp: 1_700_000_000,
};

const CONTRACT_TYPES = ['DEX', 'LENDING', 'NFT', 'BRIDGE', 'SYSTEM'];
const ASSETS = ['ETH', 'USDC', 'DAI', 'WBTC', 'ARB', 'OP'];
const TRACE_TYPES = ['CALL', 'DELEGATECALL', 'STATICCALL', 'SSTORE', 'SLOAD'];

export function generateMockBlock(options: MockBlockOptions = {}): RawBlock {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const rand = createSeededRandom(opts.seed);
  const height = opts.startHeight;
  const timestamp = opts.startTimestamp;

  const transactions = Array.from({ length: opts.txCount }, (_, index) => createMockTransaction(index, rand));
  const executionTraces = Array.from({ length: opts.txCount * opts.tracesPerTx }, (_, index) =>
    createMockTrace(index, rand),
  );
  const witnessData = {
    bundles: Array.from({ length: opts.witnessBundles }, (_, index) => createMockWitnessBundle(index, rand)),
  };

  const headerPayload = toUtf8Bytes(`${opts.seed}:${height}:${opts.txCount}`);
  const headerRlp = hexlify(headerPayload);
  const blockHash = keccak256(headerPayload);
  return {
    header: {
      height,
      hash: blockHash,
      parentHash: `0x${randomHex(rand, 32)}`,
      stateRoot: `0x${randomHex(rand, 32)}`,
      txRoot: `0x${randomHex(rand, 32)}`,
      receiptsRoot: `0x${randomHex(rand, 32)}`,
      headerRlp,
      timestamp,
    },
    transactions,
    executionTraces,
    witnessData,
  };
}

function createMockTransaction(index: number, rand: () => number): Record<string, unknown> {
  return {
    amount: randomRange(rand, 1e3, 5e8),
    fee: randomRange(rand, 1e1, 5e5),
    gasUsed: randomRange(rand, 21_000, 2_500_000),
    gasPrice: randomRange(rand, 1, 200),
    nonce: index,
    status: rand() > 0.08 ? 'success' : 'reverted',
    slot: randomRange(rand, 0, 10_000),
    chainId: 42161,
    priorityFee: randomRange(rand, 0, 500),
    contractType: pick(CONTRACT_TYPES, rand),
    asset: pick(ASSETS, rand),
    functionSelector: `0x${randomHex(rand, 4)}`,
    sender: `0x${randomHex(rand, 20)}`,
    receiver: `0x${randomHex(rand, 20)}`,
    timestamp: Date.now() / 1000,
  };
}

function createMockTrace(index: number, rand: () => number): Record<string, unknown> {
  return {
    balanceDelta: randomRange(rand, -5e8, 5e8),
    storageWrites: randomRange(rand, 0, 64),
    storageReads: randomRange(rand, 0, 64),
    logEvents: randomRange(rand, 0, 10),
    contract: `0x${randomHex(rand, 20)}`,
    asset: pick(ASSETS, rand),
    traceType: pick(TRACE_TYPES, rand),
    gasConsumed: randomRange(rand, 10_000, 2_000_000),
    slotIndex: index,
    reverted: rand() > 0.9,
  };
}

function createMockWitnessBundle(index: number, rand: () => number): Record<string, unknown> {
  return {
    constraintCount: randomRange(rand, 1e4, 5e5),
    degree: randomRange(rand, 8, 4096),
    gateCount: randomRange(rand, 1e4, 5e5),
    quotientDegree: randomRange(rand, 64, 8192),
    proverLabel: `bundle-${index}`,
    circuitType: pick(['STATE', 'TX', 'AGGREGATION'], rand),
  };
}

function randomRange(rand: () => number, min: number, max: number): number {
  return min + (max - min) * rand();
}

function randomHex(rand: () => number, bytes: number): string {
  let out = '';
  for (let i = 0; i < bytes; i += 1) {
    const value = Math.floor(rand() * 256);
    out += value.toString(16).padStart(2, '0');
  }
  return out;
}

function pick<T>(list: readonly T[], rand: () => number): T {
  const index = Math.floor(rand() * list.length);
  return list[index];
}

