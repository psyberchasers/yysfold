import 'dotenv/config';
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { JsonRpcProvider, toQuantity } from 'ethers';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { encode as encodeRlp } from '@ethersproject/rlp';
import Database from 'better-sqlite3';
import { computeFoldedBlock } from '../folding/compute.js';
import { createDeterministicCodebook, loadCodebookFromFile } from '../folding/codebook.js';
import { detectHotzones } from '../analytics/hotzones.js';
import { resolveHotzoneOptions } from '../analytics/hotzoneConfig.js';
import { buildHypergraph } from '../analytics/hypergraph.js';
import { proveFoldedBlock } from '../zk/witnessBuilder.js';
import { createHalo2Backend } from '../zk/halo2Backend.js';
import { hashCodebookRoot } from '../folding/commit.js';
import { deriveRawBlockTags } from '../analytics/tags.js';
import { computeBehaviorMetrics } from '../analytics/blockMetrics.js';
import { summarizeResiduals } from '../analytics/residuals.js';
const CHAINS = {
    eth: {
        id: 'eth',
        label: 'Ethereum Mainnet',
        kind: 'evm',
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
        kind: 'evm',
        rpcUrls: buildRpcList(process.env.AVAX_RPC_URL, [
            'https://avalanche.public-rpc.com',
            'https://rpc.ankr.com/avalanche',
            'https://avax.meowrpc.com',
        ]),
        defaultCount: 1,
    },
    sol: {
        id: 'sol',
        label: 'Solana Mainnet',
        kind: 'solana',
        rpcUrls: buildRpcList(process.env.SOLANA_RPC_URL, [
            'https://api.mainnet-beta.solana.com',
            'https://solana-mainnet.public.blastapi.io',
            'https://solana-api.projectserum.com',
        ]),
        defaultCount: 1,
    },
};
function buildRpcList(primary, fallbacks) {
    return [primary, ...fallbacks].filter((url) => Boolean(url && url.trim().length > 0));
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
        const targetCount = options.count || chain.defaultCount;
        try {
            const connection = await connectProvider(chain);
            if (connection.kind === 'solana') {
                await processSolanaChain({
                    chain,
                    connection,
                    targetCount,
                    db,
                    metricsDb,
                    codebook,
                    codebookRoot,
                    halo2,
                });
            }
            else {
                await processEvmChain({
                    chain,
                    connection,
                    targetCount,
                    db,
                    metricsDb,
                    codebook,
                    codebookRoot,
                    halo2,
                });
            }
        }
        catch (error) {
            // eslint-disable-next-line no-console
            console.error(`[${chain.id}] Unable to ingest: ${formatError(error)}`);
        }
    }
    db.close();
    metricsDb.close();
}
async function processEvmChain(args) {
    let provider = args.connection.provider;
    const latest = args.connection.latest;
    for (let offset = 0; offset < args.targetCount; offset += 1) {
        const height = latest - offset;
        if (height < 0)
            break;
        if (hasRecord(args.db, args.chain.id, height)) {
            // eslint-disable-next-line no-console
            console.log(`[${args.chain.id}] Block ${height} already processed. Skipping.`);
            continue;
        }
        // eslint-disable-next-line no-console
        console.log(`[${args.chain.id}] Fetching block ${height}`);
        let block = null;
        try {
            block = await fetchBlock(provider, height);
        }
        catch (error) {
            // eslint-disable-next-line no-console
            console.warn(`[${args.chain.id}] RPC error while fetching block ${height}: ${formatError(error)}. Rotating endpoint.`);
            try {
                const retryConnection = await connectProvider(args.chain);
                if (retryConnection.kind !== 'evm') {
                    throw new Error('Unexpected connection kind for EVM chain');
                }
                provider = retryConnection.provider;
                block = await fetchBlock(provider, height);
            }
            catch (retryError) {
                // eslint-disable-next-line no-console
                console.error(`[${args.chain.id}] Retry failed for block ${height}: ${formatError(retryError)}`);
                continue;
            }
        }
        if (!block) {
            // eslint-disable-next-line no-console
            console.warn(`Failed to fetch block ${height} for ${args.chain.id}`);
            continue;
        }
        const rawBlock = blockToRawBlock(args.chain.id, block);
        await persistBlock({
            chainId: args.chain.id,
            height,
            rawBlock,
            db: args.db,
            metricsDb: args.metricsDb,
            codebook: args.codebook,
            codebookRoot: args.codebookRoot,
            halo2: args.halo2,
        });
    }
}
async function processSolanaChain(args) {
    let connection = args.connection.connection;
    const latest = args.connection.latest;
    for (let offset = 0; offset < args.targetCount; offset += 1) {
        const slot = latest - offset;
        if (slot < 0)
            break;
        if (hasRecord(args.db, args.chain.id, slot)) {
            // eslint-disable-next-line no-console
            console.log(`[${args.chain.id}] Block ${slot} already processed. Skipping.`);
            continue;
        }
        // eslint-disable-next-line no-console
        console.log(`[${args.chain.id}] Fetching block ${slot}`);
        let block = null;
        try {
            block = await fetchSolanaBlock(connection, slot);
        }
        catch (error) {
            // eslint-disable-next-line no-console
            console.warn(`[${args.chain.id}] RPC error while fetching block ${slot}: ${formatError(error)}. Rotating endpoint.`);
            try {
                const retryConnection = await connectProvider(args.chain);
                if (retryConnection.kind !== 'solana') {
                    throw new Error('Unexpected connection kind for Solana chain');
                }
                connection = retryConnection.connection;
                block = await fetchSolanaBlock(connection, slot);
            }
            catch (retryError) {
                // eslint-disable-next-line no-console
                console.error(`[${args.chain.id}] Retry failed for block ${slot}: ${formatError(retryError)}`);
                continue;
            }
        }
        if (!block) {
            // eslint-disable-next-line no-console
            console.warn(`[${args.chain.id}] Block ${slot} is unavailable or not finalized. Skipping.`);
            continue;
        }
        const rawBlock = solanaBlockToRawBlock(args.chain.id, slot, block);
        await persistBlock({
            chainId: args.chain.id,
            height: slot,
            rawBlock,
            db: args.db,
            metricsDb: args.metricsDb,
            codebook: args.codebook,
            codebookRoot: args.codebookRoot,
            halo2: args.halo2,
        });
    }
}
async function persistBlock(args) {
    const paths = writeArtifacts(args.chainId, args.height, args.rawBlock);
    const summary = await computeSummary(args.rawBlock, args.chainId, args.height, args.codebook, args.codebookRoot, args.halo2);
    const rawTags = summary.rawTags ?? [];
    saveSummary(paths.summaryPath, summary);
    saveHotzones(paths.hotzonesPath, summary.hotzones, summary.hypergraph);
    saveProof(paths.proofPath, summary.proofHex);
    const timestamp = args.rawBlock.header.timestamp ?? Math.floor(Date.now() / 1000);
    insertRecord(args.db, {
        chain: args.chainId,
        height: args.height,
        blockHash: args.rawBlock.header.hash ?? '',
        timestamp,
        blockPath: paths.blockPath,
        summaryPath: paths.summaryPath,
        hotzonesPath: paths.hotzonesPath,
        proofPath: paths.proofPath,
        tags: summary.semanticTags,
    });
    // eslint-disable-next-line no-console
    console.log(`[${args.chainId}] Stored block ${args.height} (commit=${summary.commitments.foldedCommitment.slice(0, 10)}...)`);
    recordMetrics(args.metricsDb, {
        chain: args.chainId,
        height: args.height,
        timestamp,
        hotzones: summary.hotzones ?? [],
        semanticTags: summary.semanticTags ?? [],
        rawTags,
        behaviorMetrics: summary.behaviorMetrics,
        pqResidualStats: summary.pqResidualStats,
    });
    recordHotzoneSamples(args.metricsDb, {
        chain: args.chainId,
        height: args.height,
        timestamp,
        hotzones: summary.hotzones ?? [],
    });
    recordPQResidualSamples(args.metricsDb, {
        chain: args.chainId,
        height: args.height,
        timestamp,
        residuals: summary.pqResiduals ?? [],
    });
}
function parseArgs(argv) {
    const options = {
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
        }
        else if (token.startsWith('--count=')) {
            const value = Number.parseInt(token.slice('--count='.length), 10);
            if (Number.isFinite(value) && value > 0) {
                options.count = value;
            }
        }
    });
    return options;
}
async function connectProvider(chain) {
    const errors = [];
    for (const url of chain.rpcUrls) {
        try {
            if (chain.kind === 'solana') {
                const connection = new Connection(url, { commitment: 'confirmed' });
                const latest = await connection.getSlot('confirmed');
                // eslint-disable-next-line no-console
                console.log(`[${chain.id}] Connected to RPC ${url}`);
                return { kind: 'solana', connection, latest };
            }
            const provider = new JsonRpcProvider(url);
            const latest = await provider.getBlockNumber();
            // eslint-disable-next-line no-console
            console.log(`[${chain.id}] Connected to RPC ${url}`);
            return { kind: 'evm', provider, latest };
        }
        catch (error) {
            const message = formatError(error);
            errors.push(`${url}: ${message}`);
            // eslint-disable-next-line no-console
            console.warn(`[${chain.id}] RPC ${url} failed: ${message}`);
        }
    }
    throw new Error(`[${chain.id}] All RPC endpoints failed. ${errors.join(' | ')}`);
}
async function fetchBlock(provider, height) {
    return (await provider.send('eth_getBlockByNumber', [toQuantity(height), true]));
}
async function fetchSolanaBlock(connection, slot) {
    return connection.getBlock(slot, {
        commitment: 'confirmed',
        rewards: false,
        maxSupportedTransactionVersion: 0,
        transactionDetails: 'full',
    });
}
function solanaBlockToRawBlock(chainId, slot, block) {
    const timestamp = block.blockTime ?? Math.floor(Date.now() / 1000);
    const headerHash = block.blockhash ?? `slot-${slot}`;
    const transactions = Array.isArray(block.transactions)
        ? block.transactions
        : [];
    return {
        header: {
            height: slot,
            hash: headerHash,
            parentHash: block.previousBlockhash ?? '',
            stateRoot: headerHash,
            txRoot: headerHash,
            receiptsRoot: headerHash,
            timestamp,
            headerRlp: headerHash,
        },
        transactions: transactions.map((tx) => mapSolanaTransaction(tx)),
        executionTraces: [],
        witnessData: {
            slot,
            chain: chainId,
        },
    };
}
function mapSolanaTransaction(entry) {
    if (!entry)
        return {};
    const transaction = entry?.transaction ?? {};
    const message = transaction.message ?? {};
    const signatures = Array.isArray(transaction.signatures) ? transaction.signatures : [];
    const signature = signatures[0] ?? '';
    const meta = entry?.meta ?? {};
    const accountKeys = extractSolanaAccountKeys(message);
    const sender = accountKeys[0] ?? '';
    const receiver = accountKeys[1] ?? '';
    const lamportDelta = computeLamportDelta(meta);
    const amountLamports = Math.abs(lamportDelta);
    const primaryProgram = extractSolanaProgramId(message) ?? '';
    const instruction = Array.isArray(message.instructions) ? message.instructions[0] : null;
    const dataSize = typeof instruction?.data === 'string'
        ? instruction.data.length
        : Array.isArray(instruction?.data)
            ? instruction.data.length
            : 0;
    return {
        hash: signature,
        amountWei: amountLamports,
        amountEth: amountLamports / LAMPORTS_PER_SOL,
        fee: meta.fee ?? 0,
        gasUsed: meta.computeUnitsConsumed ?? 0,
        gasPrice: 0,
        nonce: 0,
        status: meta.err ? 'failed' : 'success',
        chainId: 101,
        sender,
        receiver,
        contractType: 'SOLANA_PROGRAM',
        dataSize,
        functionSelector: primaryProgram,
    };
}
function extractSolanaAccountKeys(message) {
    if (!message)
        return [];
    if (Array.isArray(message.accountKeys) && message.accountKeys.length > 0) {
        return message.accountKeys.map((key) => toBase58String(key)).filter(Boolean);
    }
    if (Array.isArray(message.staticAccountKeys) && message.staticAccountKeys.length > 0) {
        return message.staticAccountKeys.map((key) => toBase58String(key)).filter(Boolean);
    }
    return [];
}
function extractSolanaProgramId(message) {
    if (!message)
        return null;
    const instructions = message.instructions;
    if (Array.isArray(instructions) && instructions.length > 0) {
        const instr = instructions[0];
        if (typeof instr.programId === 'string') {
            return instr.programId;
        }
        if (typeof instr.programIdIndex === 'number' && Array.isArray(message.accountKeys)) {
            const account = message.accountKeys[instr.programIdIndex];
            return account ? toBase58String(account) : null;
        }
        if (instr.programId && typeof instr.programId.toBase58 === 'function') {
            return instr.programId.toBase58();
        }
    }
    return null;
}
function toBase58String(value) {
    if (typeof value === 'string')
        return value;
    if (value && typeof value === 'object') {
        const maybe = value;
        if (typeof maybe.toBase58 === 'function')
            return maybe.toBase58();
        if (maybe.pubkey && typeof maybe.pubkey.toBase58 === 'function')
            return maybe.pubkey.toBase58();
    }
    return '';
}
function computeLamportDelta(meta) {
    const pre = Array.isArray(meta?.['preBalances']) ? meta['preBalances'] : [];
    const post = Array.isArray(meta?.['postBalances']) ? meta['postBalances'] : [];
    if (pre.length === 0 || post.length === 0)
        return 0;
    return (pre[0] ?? 0) - (post[0] ?? 0);
}
function formatError(error) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === 'string')
        return error;
    try {
        return JSON.stringify(error);
    }
    catch {
        return 'unknown error';
    }
}
function createHalo2Context() {
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
    const dataDir = process.env.DATA_DIR ?? resolve('artifacts');
    const dbPath = join(dataDir, 'index.db');
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
    }
    catch (error) {
        // column already exists
    }
    return db;
}
function initMetricsDatabase() {
    const dataDir = process.env.DATA_DIR ?? resolve('artifacts');
    const dbPath = join(dataDir, 'telemetry.db');
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
function ensureBehaviorColumns(db) {
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
        }
        catch {
            // column exists
        }
    });
}
function hasRecord(db, chain, height) {
    const stmt = db.prepare('SELECT 1 FROM block_summaries WHERE chain = ? AND height = ?');
    return stmt.get(chain, height) !== undefined;
}
function insertRecord(db, record) {
    const stmt = db.prepare(`
    INSERT INTO block_summaries (chain, height, block_hash, timestamp, block_path, summary_path, hotzones_path, proof_path, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
    stmt.run(record.chain, record.height, record.blockHash, record.timestamp, record.blockPath, record.summaryPath, record.hotzonesPath, record.proofPath, JSON.stringify(record.tags ?? []));
}
function recordMetrics(db, payload) {
    const peakDensity = payload.hotzones.reduce((acc, hz) => Math.max(acc, Number(hz?.density ?? 0)), 0);
    const avgDensity = payload.hotzones.length > 0
        ? payload.hotzones.reduce((acc, hz) => acc + Number(hz?.density ?? 0), 0) /
            payload.hotzones.length
        : 0;
    const behavior = payload.behaviorMetrics ?? emptyBehaviorMetrics();
    const pqStats = payload.pqResidualStats ?? summarizeResiduals([]);
    const stmt = db.prepare(`
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
  `);
    const timestampSeconds = Number.isFinite(Number(payload.timestamp))
        ? Math.floor(Number(payload.timestamp))
        : Math.floor(Date.now() / 1000);
    stmt.run(payload.chain, payload.height, timestampSeconds, payload.hotzones.length, peakDensity, avgDensity, JSON.stringify(Array.from(new Set([...(payload.semanticTags ?? []), ...payload.rawTags]))), behavior.dexGasShare, behavior.nftGasShare, behavior.lendingVolumeWei, behavior.bridgeVolumeWei, behavior.highFeeTxCount, behavior.dexTxCount, behavior.nftTxCount, behavior.lendingTxCount, behavior.bridgeTxCount, behavior.dominantFlow ?? null, JSON.stringify(behavior.topContracts ?? []), pqStats.average, pqStats.max, pqStats.p95);
}
function recordHotzoneSamples(db, payload) {
    if (!payload.hotzones || payload.hotzones.length === 0)
        return;
    const stmt = db.prepare(`
    INSERT INTO hotzone_samples (chain, height, timestamp, hotzone_id, density, radius, vector, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
    const timestampSeconds = Number.isFinite(payload.timestamp)
        ? Math.floor(payload.timestamp)
        : Math.floor(Date.now() / 1000);
    payload.hotzones.forEach((hotzone, index) => {
        stmt.run(payload.chain, payload.height, timestampSeconds, hotzone.id ?? `hotzone-${index}`, Number(hotzone.density ?? 0), Number(hotzone.radius ?? 0), JSON.stringify(hotzone.center ?? []), JSON.stringify(hotzone.semanticTags ?? []));
    });
}
function recordPQResidualSamples(db, payload) {
    if (!payload.residuals || payload.residuals.length === 0)
        return;
    const stmt = db.prepare(`
    INSERT INTO pq_residual_samples (chain, height, timestamp, vector_index, residual)
    VALUES (?, ?, ?, ?, ?)
  `);
    const timestampSeconds = Number.isFinite(payload.timestamp)
        ? Math.floor(payload.timestamp)
        : Math.floor(Date.now() / 1000);
    payload.residuals.forEach((value, index) => {
        stmt.run(payload.chain, payload.height, timestampSeconds, index, Number(value ?? 0));
    });
}
function emptyBehaviorMetrics() {
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
export function blockToRawBlock(chainId, block) {
    const transactions = block.transactions ?? [];
    return {
        header: {
            height: Number(block.number),
            hash: block.hash ?? '',
            parentHash: block.parentHash ?? '',
            stateRoot: block.stateRoot ?? block.hash ?? '',
            txRoot: block.transactionsRoot ?? '',
            receiptsRoot: block.receiptsRoot ?? '',
            timestamp: Number(block.timestamp),
            headerRlp: encodeHeaderRlp(block),
        },
        transactions: transactions.map((tx) => {
            const gasLimit = parseQuantity(tx.gas ?? tx.gasLimit ?? 0);
            const gasUsed = parseQuantity(tx.gasUsed ?? gasLimit);
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
function encodeHeaderRlp(block) {
    const fields = [
        normalizeHex(block.parentHash),
        normalizeHex(block.sha3Uncles ?? block.unclesHash ?? '0x'),
        normalizeHex(block.miner ?? block.coinbase ?? '0x'),
        normalizeHex(block.stateRoot ?? '0x'),
        normalizeHex(block.transactionsRoot ?? '0x'),
        normalizeHex(block.receiptsRoot ?? '0x'),
        normalizeHex(block.logsBloom ?? '0x'),
        normalizeQuantity(block.difficulty ?? 0),
        normalizeQuantity(block.number ?? 0),
        normalizeQuantity(block.gasLimit ?? 0),
        normalizeQuantity(block.gasUsed ?? 0),
        normalizeQuantity(block.timestamp ?? 0),
        normalizeHex(block.extraData ?? '0x'),
        normalizeHex(block.mixHash ?? block.prevRandao ?? '0x'),
        normalizeHex(block.nonce ?? '0x'),
    ];
    if (block.baseFeePerGas !== null && block.baseFeePerGas !== undefined) {
        fields.push(normalizeQuantity(block.baseFeePerGas));
    }
    if (block.withdrawalsRoot) {
        fields.push(normalizeHex(block.withdrawalsRoot));
    }
    if (block.blobGasUsed !== null && block.blobGasUsed !== undefined) {
        fields.push(normalizeQuantity(block.blobGasUsed));
    }
    if (block.excessBlobGas !== null && block.excessBlobGas !== undefined) {
        fields.push(normalizeQuantity(block.excessBlobGas));
    }
    if (block.parentBeaconBlockRoot) {
        fields.push(normalizeHex(block.parentBeaconBlockRoot));
    }
    if (block.requestsHash) {
        fields.push(normalizeHex(block.requestsHash));
    }
    return encodeRlp(fields);
}
function normalizeHex(value) {
    if (typeof value === 'string' && value.length > 0) {
        if (value === '0x0' || value === '0x00')
            return '0x';
        return ensureEvenHex(value);
    }
    return '0x';
}
function normalizeQuantity(value) {
    if (value === undefined || value === null) {
        return '0x';
    }
    const hex = toQuantity(value);
    if (hex === '0x0')
        return '0x';
    return ensureEvenHex(hex);
}
function ensureEvenHex(hex) {
    if (hex === '0x')
        return hex;
    return hex.length % 2 === 0 ? hex : `0x0${hex.slice(2)}`;
}
function parseQuantity(value) {
    if (typeof value === 'number')
        return value;
    if (typeof value === 'bigint')
        return Number(value);
    if (typeof value === 'string') {
        if (value.startsWith('0x')) {
            return Number.parseInt(value, 16);
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
}
function extractFunctionSelector(tx) {
    const record = tx;
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
function readInputData(tx) {
    const record = tx;
    if (typeof record['input'] === 'string')
        return record['input'];
    if (typeof record['data'] === 'string')
        return record['data'];
    return '';
}
function writeArtifacts(chain, height, rawBlock) {
    const dataDir = process.env.DATA_DIR ?? resolve('artifacts');
    const dir = join(dataDir, 'blocks', chain, `${height}`);
    mkdirSync(dir, { recursive: true });
    const blockPath = join(dir, 'raw-block.json');
    writeFileSync(blockPath, JSON.stringify(rawBlock, null, 2), 'utf-8');
    const summaryPath = join(dir, 'summary.json');
    const hotzonesPath = join(dir, 'hotzones.json');
    const proofPath = join(dir, 'proof.json');
    return { dir, blockPath, summaryPath, hotzonesPath, proofPath };
}
async function computeSummary(rawBlock, chain, height, codebook, codebookRoot, halo2) {
    const artifact = computeFoldedBlock(rawBlock, codebook);
    const pqResiduals = artifact.pqCode.residuals ?? [];
    const pqResidualStats = summarizeResiduals(pqResiduals);
    const rawTags = deriveRawBlockTags(rawBlock);
    const behaviorMetrics = computeBehaviorMetrics(rawBlock);
    const requestedZones = Number(process.env.HOTZONE_LIMIT ?? 18);
    const maxZones = Number.isFinite(requestedZones) && requestedZones > 0 ? requestedZones : 18;
    const hotzones = detectHotzones(artifact.pqCode, codebook, resolveHotzoneOptions(chain, {
        maxZones,
        contextTags: rawTags,
    }));
    const hypergraph = buildHypergraph(hotzones, {
        densityThreshold: 5e-5,
        maxEdgeSize: 4,
    });
    const semanticTags = Array.from(new Set([
        ...rawTags,
        ...hotzones.flatMap((hz) => hz.semanticTags ?? []),
    ]));
    appendTrainingVectors(chain, height, artifact.foldedBlock.foldedVectors);
    // Skip ZK proving if disabled (e.g., in cloud where Halo2 binary isn't available)
    const skipZk = process.env.SKIP_ZK_PROVING === '1' || process.env.SKIP_ZK_PROVING === 'true';
    let proofHex = '';
    let zkPublicInputs = {
        prevStateRoot: rawBlock.header.parentHash ?? '',
        newStateRoot: rawBlock.header.stateRoot ?? '',
        blockHeight: rawBlock.header.height,
        txMerkleRoot: rawBlock.header.txRoot ?? '',
        foldedCommitment: artifact.commitments.foldedCommitment,
        pqCommitment: artifact.commitments.pqCommitment,
        codebookRoot,
    };
    if (!skipZk) {
        const params = {
            provingKeyPath: halo2.provingKeyPath,
            verificationKeyPath: halo2.verificationKeyPath,
            curve: 'bn254',
            backend: 'halo2',
            codebookRoot,
        };
        const proof = await proveFoldedBlock(rawBlock, artifact, codebook, params, halo2.backend);
        zkPublicInputs = proof.publicInputs;
        proofHex = Buffer.from(proof.proofBytes).toString('hex');
    }
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
        headerRlp: rawBlock.header.headerRlp,
        publicInputs: zkPublicInputs,
        proofHex,
    };
}
function saveSummary(path, summary) {
    writeFileSync(path, JSON.stringify(summary, null, 2), 'utf-8');
}
function saveHotzones(path, hotzones, hypergraph) {
    writeFileSync(path, JSON.stringify({ hotzones, hypergraph }, null, 2), 'utf-8');
}
function saveProof(path, proofHex) {
    writeFileSync(path, JSON.stringify({ proofHex }, null, 2), 'utf-8');
}
function appendTrainingVectors(chain, height, vectors) {
    const dataDir = process.env.DATA_DIR ?? resolve('artifacts');
    const trainingDir = join(dataDir, 'training');
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
