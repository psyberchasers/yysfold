import 'dotenv/config';
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { JsonRpcProvider, Block, TransactionResponse, toQuantity } from 'ethers';
import Database from 'better-sqlite3';
import { PQCodebook, RawBlock } from '../folding/types.js';
import { computeFoldedBlock } from '../folding/compute.js';
import { createDeterministicCodebook, loadCodebookFromFile } from '../folding/codebook.js';
import { detectHotzones } from '../analytics/hotzones.js';
import { resolveHotzoneOptions } from '../analytics/hotzoneConfig.js';
import { buildHypergraph } from '../analytics/hypergraph.js';
import { proveFoldedBlock, type ZkBackend } from '../zk/witnessBuilder.js';
import { createHalo2Backend } from '../zk/halo2Backend.js';
import { hashCodebookRoot } from '../folding/commit.js';
import { deriveRawBlockTags } from '../analytics/tags.js';
import { computeBehaviorMetrics } from '../analytics/blockMetrics.js';
import { summarizeResiduals, type ResidualStats } from '../analytics/residuals.js';
import type { BehaviorMetrics } from '../shared/behavior.js';

interface ChainConfig {
  id: string;
  label: string;
  rpcUrls: string[];
  defaultCount: number;
}

const CHAINS: Record<string, ChainConfig> = {
  eth: {
    id: 'eth',
    label: 'Ethereum Mainnet',
    rpcUrls: buildRpcList(process.env.ETH_RPC_URL, [
      'https://eth.llamarpc.com',
      'https://rpc.ankr.com/eth',
      'https://eth-mainnet.public.blastapi.io',
    ]),
    defaultCount: 1,
  },
  avax: {
    id: 'avax',
    label: 'Avalanche C-Chain',
    rpcUrls: buildRpcList(process.env.AVAX_RPC_URL, [
      'https://avalanche.public-rpc.com',
      'https://rpc.ankr.com/avalanche',
      'https://avax.meowrpc.com',
    ]),
    defaultCount: 1,
  },
};

function buildRpcList(primary: string | undefined, fallbacks: string[]): string[] {
  return [primary, ...fallbacks].filter((url): url is string => Boolean(url && url.trim().length > 0));
}

interface CliOptions {
  chains: string[];
  count: number;
}

interface Halo2Context {
  backend: ZkBackend;
  provingKeyPath: string;
  verificationKeyPath: string;
}

function loadActiveCodebook() {
  const configuredPath = process.env.CODEBOOK_PATH ?? resolve('artifacts', 'codebooks', 'latest.json');
  if (existsSync(configuredPath)) {
    // eslint-disable-next-line no-console
    console.log(`[codebook] Loading ${configuredPath}`);
    return loadCodebookFromFile(configuredPath);
  }
  // eslint-disable-next-line no-console
  console.log('[codebook] No trained codebook found. Using deterministic fallback.');
  return createDeterministicCodebook({
    numSubspaces: 4,
    subvectorDim: 4,
    numCentroids: 64,
    seed: 'pipeline-demo',
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const db = initDatabase();
  const metricsDb = initMetricsDatabase();
  const codebook = loadActiveCodebook();
  const codebookRoot = hashCodebookRoot(codebook);
  const halo2 = createHalo2Context();
  for (const chainId of options.chains) {
    const chain = CHAINS[chainId];
    if (!chain) {
      // eslint-disable-next-line no-console
      console.warn(`Skipping unknown chain "${chainId}"`);
      continue;
    }
    const connection = await connectProvider(chain);
    let provider = connection.provider;
    const latest = connection.latest;
    const targetCount = options.count || chain.defaultCount;
    for (let offset = 0; offset < targetCount; offset += 1) {
      const height = latest - offset;
      if (height < 0) break;
      if (hasRecord(db, chain.id, height)) {
        // eslint-disable-next-line no-console
        console.log(`[${chain.id}] Block ${height} already processed. Skipping.`);
        continue;
      }
      // eslint-disable-next-line no-console
      console.log(`[${chain.id}] Fetching block ${height}`);
      let block: FullBlock | null = null;
      try {
        block = await fetchBlock(provider, height);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`[${chain.id}] RPC error while fetching block ${height}: ${formatError(error)}. Rotating endpoint.`);
        try {
          const retryConnection = await connectProvider(chain);
          provider = retryConnection.provider;
          block = await fetchBlock(provider, height);
        } catch (retryError) {
          // eslint-disable-next-line no-console
          console.error(`[${chain.id}] Retry failed for block ${height}: ${formatError(retryError)}`);
          continue;
        }
      }
      if (!block) {
        // eslint-disable-next-line no-console
        console.warn(`Failed to fetch block ${height} for ${chain.id}`);
        continue;
      }
      const rawBlock = blockToRawBlock(chain.id, block);
      const paths = writeArtifacts(chain.id, height, rawBlock);
      const summary = await computeSummary(rawBlock, chain.id, height, codebook, codebookRoot, halo2);
      const rawTags = summary.rawTags ?? [];
      saveSummary(paths.summaryPath, summary);
      saveHotzones(paths.hotzonesPath, summary.hotzones, summary.hypergraph);
      saveProof(paths.proofPath, summary.proofHex);
      insertRecord(db, {
        chain: chain.id,
        height,
        blockHash: block.hash ?? '',
        timestamp: block.timestamp,
        blockPath: paths.blockPath,
        summaryPath: paths.summaryPath,
        hotzonesPath: paths.hotzonesPath,
        proofPath: paths.proofPath,
      tags: summary.semanticTags,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[${chain.id}] Stored block ${height} (commit=${summary.commitments.foldedCommitment.slice(
          0,
          10,
        )}...)`,
      );
      recordMetrics(metricsDb, {
        chain: chain.id,
        height,
        timestamp: rawBlock.header.timestamp ?? block.timestamp ?? Math.floor(Date.now() / 1000),
        hotzones: summary.hotzones ?? [],
        semanticTags: summary.semanticTags ?? [],
        rawTags,
        behaviorMetrics: summary.behaviorMetrics,
        pqResidualStats: summary.pqResidualStats,
      });
      recordHotzoneSamples(metricsDb, {
        chain: chain.id,
        height,
        timestamp: rawBlock.header.timestamp ?? block.timestamp ?? Math.floor(Date.now() / 1000),
        hotzones: summary.hotzones ?? [],
      });
      recordPQResidualSamples(metricsDb, {
        chain: chain.id,
        height,
        timestamp: rawBlock.header.timestamp ?? block.timestamp ?? Math.floor(Date.now() / 1000),
        residuals: summary.pqResiduals ?? [],
      });
    }
  }
  db.close();
  metricsDb.close();
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    chains: Object.keys(CHAINS),
    count: 1,
  };
  argv.forEach((token) => {
    if (token.startsWith('--chains=')) {
      options.chains = token
        .slice('--chains='.length)
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    } else if (token.startsWith('--count=')) {
      const value = Number.parseInt(token.slice('--count='.length), 10);
      if (Number.isFinite(value) && value > 0) {
        options.count = value;
      }
    }
  });
  return options;
}

async function connectProvider(chain: ChainConfig) {
  const errors: string[] = [];
  for (const url of chain.rpcUrls) {
    try {
      const provider = new JsonRpcProvider(url);
      const latest = await provider.getBlockNumber();
      // eslint-disable-next-line no-console
      console.log(`[${chain.id}] Connected to RPC ${url}`);
      return { provider, latest };
    } catch (error) {
      const message = formatError(error);
      errors.push(`${url}: ${message}`);
      // eslint-disable-next-line no-console
      console.warn(`[${chain.id}] RPC ${url} failed: ${message}`);
    }
  }
  throw new Error(`[${chain.id}] All RPC endpoints failed. ${errors.join(' | ')}`);
}

async function fetchBlock(provider: JsonRpcProvider, height: number) {
  return (await provider.send('eth_getBlockByNumber', [toQuantity(height), true])) as FullBlock | null;
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'unknown error';
  }
}

function createHalo2Context(): Halo2Context {
  const proverCommand = process.env.HALO2_PROVER_BIN ?? resolve('halo2', 'target', 'release', 'prover');
  const verifierCommand = process.env.HALO2_VERIFIER_BIN ?? resolve('halo2', 'target', 'release', 'verifier');
  const provingKeyPath = process.env.HALO2_PK_PATH ?? resolve('artifacts', 'halo2-proving.json');
  const verificationKeyPath = process.env.HALO2_VK_PATH ?? resolve('artifacts', 'halo2-verifier.json');
  const workspaceDir = process.env.HALO2_WORKSPACE ?? resolve('artifacts', 'halo2-workspace');
  const timeoutMs = process.env.HALO2_TIMEOUT_MS
    ? Number.parseInt(process.env.HALO2_TIMEOUT_MS, 10)
    : 600_000;

  mkdirSync(dirname(provingKeyPath), { recursive: true });
  mkdirSync(dirname(verificationKeyPath), { recursive: true });
  mkdirSync(workspaceDir, { recursive: true });

  const backend = createHalo2Backend({
    proverCommand,
    verifierCommand,
    workspaceDir,
    timeoutMs,
  });
  return {
    backend,
    provingKeyPath,
    verificationKeyPath,
  };
}

function initDatabase() {
  const dbPath = resolve('artifacts', 'index.db');
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS block_summaries (
      chain TEXT NOT NULL,
      height INTEGER NOT NULL,
      block_hash TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      block_path TEXT NOT NULL,
      summary_path TEXT NOT NULL,
      hotzones_path TEXT NOT NULL,
      proof_path TEXT NOT NULL,
      tags TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(chain, height)
    );
  `);
  try {
    db.exec(`ALTER TABLE block_summaries ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';`);
  } catch (error) {
    // column already exists
  }
  return db;
}

function initMetricsDatabase() {
  const dbPath = resolve('artifacts', 'telemetry.db');
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS block_metrics (
      chain TEXT NOT NULL,
      height INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      hotzone_count INTEGER NOT NULL,
      peak_density REAL NOT NULL,
      avg_density REAL NOT NULL,
      tags TEXT NOT NULL,
      dex_gas_share REAL NOT NULL DEFAULT 0,
      nft_gas_share REAL NOT NULL DEFAULT 0,
      lending_volume_wei REAL NOT NULL DEFAULT 0,
      bridge_volume_wei REAL NOT NULL DEFAULT 0,
      high_fee_tx INTEGER NOT NULL DEFAULT 0,
      dex_tx_count INTEGER NOT NULL DEFAULT 0,
      nft_tx_count INTEGER NOT NULL DEFAULT 0,
      lending_tx_count INTEGER NOT NULL DEFAULT 0,
      bridge_tx_count INTEGER NOT NULL DEFAULT 0,
      dominant_flow TEXT,
      top_contracts TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(chain, height)
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS hotzone_samples (
      chain TEXT NOT NULL,
      height INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      hotzone_id TEXT NOT NULL,
      density REAL NOT NULL,
      radius REAL NOT NULL,
      vector TEXT NOT NULL,
      tags TEXT NOT NULL
    );
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS pq_residual_samples (
      chain TEXT NOT NULL,
      height INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      vector_index INTEGER NOT NULL,
      residual REAL NOT NULL
    );
  `);
  ensureBehaviorColumns(db);
  return db;
}

function ensureBehaviorColumns(db: Database.Database) {
  const statements = [
    "ALTER TABLE block_metrics ADD COLUMN dex_gas_share REAL NOT NULL DEFAULT 0;",
    "ALTER TABLE block_metrics ADD COLUMN nft_gas_share REAL NOT NULL DEFAULT 0;",
    "ALTER TABLE block_metrics ADD COLUMN lending_volume_wei REAL NOT NULL DEFAULT 0;",
    "ALTER TABLE block_metrics ADD COLUMN bridge_volume_wei REAL NOT NULL DEFAULT 0;",
    "ALTER TABLE block_metrics ADD COLUMN high_fee_tx INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE block_metrics ADD COLUMN dex_tx_count INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE block_metrics ADD COLUMN nft_tx_count INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE block_metrics ADD COLUMN lending_tx_count INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE block_metrics ADD COLUMN bridge_tx_count INTEGER NOT NULL DEFAULT 0;",
    "ALTER TABLE block_metrics ADD COLUMN dominant_flow TEXT;",
    "ALTER TABLE block_metrics ADD COLUMN top_contracts TEXT NOT NULL DEFAULT '[]';",
    "ALTER TABLE block_metrics ADD COLUMN pq_error_avg REAL NOT NULL DEFAULT 0;",
    "ALTER TABLE block_metrics ADD COLUMN pq_error_max REAL NOT NULL DEFAULT 0;",
    "ALTER TABLE block_metrics ADD COLUMN pq_error_p95 REAL NOT NULL DEFAULT 0;",
  ];
  statements.forEach((sql) => {
    try {
      db.exec(sql);
    } catch {
      // column exists
    }
  });
}

function hasRecord(db: Database.Database, chain: string, height: number) {
  const stmt = db.prepare('SELECT 1 FROM block_summaries WHERE chain = ? AND height = ?');
  return stmt.get(chain, height) !== undefined;
}

function insertRecord(
  db: Database.Database,
  record: {
    chain: string;
    height: number;
    blockHash: string;
    timestamp: number;
    blockPath: string;
    summaryPath: string;
    hotzonesPath: string;
    proofPath: string;
    tags?: string[];
  },
) {
  const stmt = db.prepare(
    `
    INSERT INTO block_summaries (chain, height, block_hash, timestamp, block_path, summary_path, hotzones_path, proof_path, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  );
  stmt.run(
    record.chain,
    record.height,
    record.blockHash,
    record.timestamp,
    record.blockPath,
    record.summaryPath,
    record.hotzonesPath,
    record.proofPath,
    JSON.stringify(record.tags ?? []),
  );
}

function recordMetrics(
  db: Database.Database,
  payload: {
    chain: string;
    height: number;
    timestamp: number;
    hotzones: any[];
    semanticTags: string[];
    rawTags: string[];
    behaviorMetrics?: BehaviorMetrics | null;
    pqResidualStats?: ResidualStats;
  },
) {
  const peakDensity = payload.hotzones.reduce(
    (acc, hz) => Math.max(acc, Number(hz?.density ?? 0)),
    0,
  );
  const avgDensity =
    payload.hotzones.length > 0
      ? payload.hotzones.reduce((acc, hz) => acc + Number(hz?.density ?? 0), 0) /
        payload.hotzones.length
      : 0;
  const behavior = payload.behaviorMetrics ?? emptyBehaviorMetrics();
  const pqStats = payload.pqResidualStats ?? summarizeResiduals([]);
  const stmt = db.prepare(
    `
    INSERT OR REPLACE INTO block_metrics (
      chain,
      height,
      timestamp,
      hotzone_count,
      peak_density,
      avg_density,
      tags,
      dex_gas_share,
      nft_gas_share,
      lending_volume_wei,
      bridge_volume_wei,
      high_fee_tx,
      dex_tx_count,
      nft_tx_count,
      lending_tx_count,
      bridge_tx_count,
      dominant_flow,
      top_contracts,
      pq_error_avg,
      pq_error_max,
      pq_error_p95
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  );
  const timestampSeconds = Number.isFinite(Number(payload.timestamp))
    ? Math.floor(Number(payload.timestamp))
    : Math.floor(Date.now() / 1000);
  stmt.run(
    payload.chain,
    payload.height,
    timestampSeconds,
    payload.hotzones.length,
    peakDensity,
    avgDensity,
    JSON.stringify(Array.from(new Set([...(payload.semanticTags ?? []), ...payload.rawTags]))),
    behavior.dexGasShare,
    behavior.nftGasShare,
    behavior.lendingVolumeWei,
    behavior.bridgeVolumeWei,
    behavior.highFeeTxCount,
    behavior.dexTxCount,
    behavior.nftTxCount,
    behavior.lendingTxCount,
    behavior.bridgeTxCount,
    behavior.dominantFlow ?? null,
    JSON.stringify(behavior.topContracts ?? []),
    pqStats.average,
    pqStats.max,
    pqStats.p95,
  );
}

function recordHotzoneSamples(
  db: Database.Database,
  payload: {
    chain: string;
    height: number;
    timestamp: number;
    hotzones: any[];
  },
) {
  if (!payload.hotzones || payload.hotzones.length === 0) return;
  const stmt = db.prepare(
    `
    INSERT INTO hotzone_samples (chain, height, timestamp, hotzone_id, density, radius, vector, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  );
  const timestampSeconds = Number.isFinite(payload.timestamp)
    ? Math.floor(payload.timestamp)
    : Math.floor(Date.now() / 1000);
  payload.hotzones.forEach((hotzone: any, index: number) => {
    stmt.run(
      payload.chain,
      payload.height,
      timestampSeconds,
      hotzone.id ?? `hotzone-${index}`,
      Number(hotzone.density ?? 0),
      Number(hotzone.radius ?? 0),
      JSON.stringify(hotzone.center ?? []),
      JSON.stringify(hotzone.semanticTags ?? []),
    );
  });
}

function recordPQResidualSamples(
  db: Database.Database,
  payload: {
    chain: string;
    height: number;
    timestamp: number;
    residuals: number[];
  },
) {
  if (!payload.residuals || payload.residuals.length === 0) return;
  const stmt = db.prepare(
    `
    INSERT INTO pq_residual_samples (chain, height, timestamp, vector_index, residual)
    VALUES (?, ?, ?, ?, ?)
  `,
  );
  const timestampSeconds = Number.isFinite(payload.timestamp)
    ? Math.floor(payload.timestamp)
    : Math.floor(Date.now() / 1000);
  payload.residuals.forEach((value, index) => {
    stmt.run(payload.chain, payload.height, timestampSeconds, index, Number(value ?? 0));
  });
}

function emptyBehaviorMetrics(): BehaviorMetrics {
  return {
    totalGas: 0,
    dexGasShare: 0,
    nftGasShare: 0,
    lendingVolumeWei: 0,
    bridgeVolumeWei: 0,
    dexTxCount: 0,
    nftTxCount: 0,
    lendingTxCount: 0,
    bridgeTxCount: 0,
    highFeeTxCount: 0,
    dominantFlow: null,
    topContracts: [],
  };
}

export type FullBlock = Block & {
  transactions: TransactionResponse[];
  transactionsRoot?: string;
  stateRoot?: string;
};

export function blockToRawBlock(chainId: string, block: FullBlock): RawBlock {
  const transactions = (block.transactions as unknown as TransactionResponse[]) ?? [];
  return {
    header: {
      height: Number(block.number),
      prevStateRoot: block.parentHash ?? '',
      newStateRoot: block.stateRoot ?? block.hash ?? '',
      timestamp: Number(block.timestamp),
      txMerkleRoot: block.transactionsRoot ?? '',
    },
    transactions: transactions.map((tx) => {
      const gasLimit = parseQuantity((tx as any).gas ?? tx.gasLimit ?? 0);
      const gasUsed = parseQuantity((tx as any).gasUsed ?? gasLimit);
      const gasPrice = parseQuantity(tx.gasPrice ?? 0);
      const fee = gasPrice * gasUsed;
      const selector = extractFunctionSelector(tx);
      const dataField = readInputData(tx);
      return {
        hash: tx.hash ?? '',
        amountWei: parseQuantity(tx.value ?? 0),
        amountEth: parseQuantity(tx.value ?? 0) / 1e18,
        fee,
        gasUsed,
        gasPrice,
        nonce: tx.nonce ?? 0,
        status: 'success',
        chainId: Number(tx.chainId ?? 0n),
        sender: tx.from ?? '',
        receiver: tx.to ?? '',
        contractType: tx.type ?? 'LEGACY',
        dataSize: dataField.length,
        functionSelector: selector,
      };
    }),
    executionTraces: transactions.map((tx, index) => ({
      balanceDelta: Number(tx.value ?? 0n),
      storageWrites: tx.data ? tx.data.length / 64 : 0,
      storageReads: tx.to ? 2 : 1,
      logEvents: tx.value ? 1 : 0,
      contract: tx.to ?? '',
      asset: chainId.toUpperCase(),
      traceType: tx.type ?? 'LEGACY',
      gasConsumed: Number(tx.gasLimit ?? 0n),
      slotIndex: index,
      reverted: false,
    })),
    witnessData: {
      bundles: [
        {
          constraintCount: transactions.length * 1000,
          degree: 2048,
          gateCount: transactions.length * 500,
          quotientDegree: 4096,
          proverLabel: 'folding-ingest',
          circuitType: 'AGGREGATION',
        },
      ],
    },
  };
}

function parseQuantity(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    if (value.startsWith('0x')) {
      return Number.parseInt(value, 16);
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function extractFunctionSelector(tx: Record<string, unknown> | TransactionResponse): string | null {
  const record = tx as Record<string, unknown>;
  if (typeof record['functionSelector'] === 'string' && record['functionSelector'].length >= 10) {
    return record['functionSelector'].slice(0, 10).toLowerCase();
  }
  if (typeof record['input'] === 'string' && record['input'].startsWith('0x') && record['input'].length >= 10) {
    return record['input'].slice(0, 10).toLowerCase();
  }
  if (typeof record['data'] === 'string' && record['data'].startsWith('0x') && record['data'].length >= 10) {
    return record['data'].slice(0, 10).toLowerCase();
  }
  return null;
}

function readInputData(tx: Record<string, unknown> | TransactionResponse): string {
  const record = tx as Record<string, unknown>;
  if (typeof record['input'] === 'string') return record['input'];
  if (typeof record['data'] === 'string') return record['data'];
  return '';
}

function writeArtifacts(chain: string, height: number, rawBlock: RawBlock) {
  const dir = resolve('artifacts', 'blocks', chain, `${height}`);
  mkdirSync(dir, { recursive: true });
  const blockPath = join(dir, 'raw-block.json');
  writeFileSync(blockPath, JSON.stringify(rawBlock, null, 2), 'utf-8');
  const summaryPath = join(dir, 'summary.json');
  const hotzonesPath = join(dir, 'hotzones.json');
  const proofPath = join(dir, 'proof.json');
  return { dir, blockPath, summaryPath, hotzonesPath, proofPath };
}

async function computeSummary(
  rawBlock: RawBlock,
  chain: string,
  height: number,
  codebook: PQCodebook,
  codebookRoot: string,
  halo2: Halo2Context,
) {
  const artifact = computeFoldedBlock(rawBlock, codebook);
  const pqResiduals = artifact.pqCode.residuals ?? [];
  const pqResidualStats = summarizeResiduals(pqResiduals);
  const rawTags = deriveRawBlockTags(rawBlock);
  const behaviorMetrics = computeBehaviorMetrics(rawBlock);
  const requestedZones = Number(process.env.HOTZONE_LIMIT ?? 18);
  const maxZones = Number.isFinite(requestedZones) && requestedZones > 0 ? requestedZones : 18;
  const hotzones = detectHotzones(
    artifact.pqCode,
    codebook,
    resolveHotzoneOptions(chain, {
      maxZones,
      contextTags: rawTags,
    }),
  );
  const hypergraph = buildHypergraph(hotzones, {
    densityThreshold: 5e-5,
    maxEdgeSize: 4,
  });
  const semanticTags = Array.from(
    new Set([
      ...rawTags,
      ...hotzones.flatMap((hz) => hz.semanticTags ?? []),
    ]),
  );
  const params = {
    provingKeyPath: halo2.provingKeyPath,
    verificationKeyPath: halo2.verificationKeyPath,
    curve: 'bn254' as const,
    backend: 'halo2' as const,
    codebookRoot,
  };
  const proof = await proveFoldedBlock(rawBlock, artifact, codebook, params, halo2.backend);
  appendTrainingVectors(chain, height, artifact.foldedBlock.foldedVectors);
  return {
    codebookRoot,
    commitments: artifact.commitments,
    foldedBlock: artifact.foldedBlock,
    pqCode: artifact.pqCode,
    pqResiduals,
    pqResidualStats,
    hotzones,
    hypergraph,
    rawTags,
    semanticTags,
    behaviorMetrics,
    publicInputs: proof.publicInputs,
    proofHex: Buffer.from(proof.proofBytes).toString('hex'),
  };
}

function saveSummary(path: string, summary: Record<string, unknown>) {
  writeFileSync(path, JSON.stringify(summary, null, 2), 'utf-8');
}

function saveHotzones(path: string, hotzones: unknown, hypergraph: unknown) {
  writeFileSync(path, JSON.stringify({ hotzones, hypergraph }, null, 2), 'utf-8');
}

function saveProof(path: string, proofHex: string) {
  writeFileSync(path, JSON.stringify({ proofHex }, null, 2), 'utf-8');
}

function appendTrainingVectors(chain: string, height: number, vectors: number[][]) {
  const trainingDir = resolve('artifacts', 'training');
  mkdirSync(trainingDir, { recursive: true });
  const filePath = join(trainingDir, 'foldedVectors.jsonl');
  const entry = JSON.stringify({ chain, height, vectors });
  appendFileSync(filePath, `${entry}\n`, 'utf-8');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Ingestion failed:', error);
    process.exitCode = 1;
  });
}

