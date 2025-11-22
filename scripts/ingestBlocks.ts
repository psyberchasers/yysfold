import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { JsonRpcProvider, Block, TransactionResponse, toQuantity } from 'ethers';
import Database from 'better-sqlite3';
import { PQCodebook, RawBlock } from '../folding/types.js';
import { computeFoldedBlock } from '../folding/compute.js';
import { createDeterministicCodebook, loadCodebookFromFile } from '../folding/codebook.js';
import { detectHotzones } from '../analytics/hotzones.js';
import { buildHypergraph } from '../analytics/hypergraph.js';
import { proveFoldedBlock, type ZkBackend } from '../zk/witnessBuilder.js';
import { createHalo2Backend } from '../zk/halo2Backend.js';
import { hashCodebookRoot } from '../folding/commit.js';
import { deriveRawBlockTags } from '../analytics/tags.js';

interface ChainConfig {
  id: string;
  label: string;
  rpcUrl: string;
  defaultCount: number;
}

const CHAINS: Record<string, ChainConfig> = {
  eth: {
    id: 'eth',
    label: 'Ethereum Mainnet',
    rpcUrl: process.env.ETH_RPC_URL ?? 'https://eth.llamarpc.com',
    defaultCount: 1,
  },
  avax: {
    id: 'avax',
    label: 'Avalanche C-Chain',
    rpcUrl: process.env.AVAX_RPC_URL ?? 'https://avalanche.public-rpc.com',
    defaultCount: 1,
  },
};

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
  const codebook = loadActiveCodebook();
  const codebookRoot = hashCodebookRoot(codebook.centroids);
  const halo2 = createHalo2Context();
  for (const chainId of options.chains) {
    const chain = CHAINS[chainId];
    if (!chain) {
      // eslint-disable-next-line no-console
      console.warn(`Skipping unknown chain "${chainId}"`);
      continue;
    }
    const provider = new JsonRpcProvider(chain.rpcUrl);
    const latest = await provider.getBlockNumber();
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
      const block = (await provider.send('eth_getBlockByNumber', [toQuantity(height), true])) as FullBlock | null;
      if (!block) {
        // eslint-disable-next-line no-console
        console.warn(`Failed to fetch block ${height} for ${chain.id}`);
        continue;
      }
      const rawBlock = blockToRawBlock(chain.id, block);
      const paths = writeArtifacts(chain.id, height, rawBlock);
      const summary = await computeSummary(rawBlock, chain.id, height, codebook, codebookRoot, halo2);
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
    }
  }
  db.close();
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
    transactions: transactions.map((tx) => ({
      hash: tx.hash ?? '',
      amountWei: Number(tx.value ?? 0n),
      amountEth: Number(tx.value ?? 0n) / 1e18,
      fee:
        tx.gasPrice && tx.gasLimit
          ? Number(tx.gasPrice ?? 0n) * Number(tx.gasLimit ?? 0n)
          : 0,
      gasUsed: Number(tx.gasLimit ?? 0n),
      gasPrice: Number(tx.gasPrice ?? 0n),
      nonce: tx.nonce ?? 0,
      status: 'success',
      chainId: Number(tx.chainId ?? 0n),
      sender: tx.from ?? '',
      receiver: tx.to ?? '',
      contractType: tx.type ?? 'LEGACY',
      dataSize: tx.data ? tx.data.length : 0,
    })),
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
  const hotzones = detectHotzones(artifact.pqCode, codebook);
  const hypergraph = buildHypergraph(hotzones);
  const rawTags = deriveRawBlockTags(rawBlock);
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
    hotzones,
    hypergraph,
    rawTags,
    semanticTags,
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

