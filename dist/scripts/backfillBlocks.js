import { JsonRpcProvider } from 'ethers';
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { blockToRawBlock } from './ingestBlocks.js';
async function main() {
    const options = parseArgs(process.argv.slice(2));
    mkdirSync(options.snapshotDir, { recursive: true });
    const dbPath = resolve('artifacts', 'index.db');
    const db = existsSync(dbPath) ? new Database(dbPath) : null;
    const provider = new JsonRpcProvider(options.rpcUrl);
    const endHeight = Math.max(0, options.startHeight - options.count + 1);
    const snapshots = [];
    // eslint-disable-next-line no-console
    console.log(`[backfill] chain=${options.chain} start=${options.startHeight} count=${options.count} chunk=${options.chunkSize}`);
    for (let current = options.startHeight; current >= endHeight; current -= options.chunkSize) {
        const chunkStart = current;
        const chunkEnd = Math.max(endHeight, chunkStart - options.chunkSize + 1);
        // eslint-disable-next-line no-console
        console.log(`[backfill] Fetching [${chunkStart}..${chunkEnd}]`);
        const blocks = await fetchChunk(provider, chunkStart, chunkEnd);
        const snapshotPath = join(options.snapshotDir, `${options.chain}-${chunkEnd}-${chunkStart}.json`);
        const snapshotEntries = [];
        blocks.forEach((block) => {
            const raw = blockToRawBlock(options.chain, block);
            // we rely on normal ingest to compute summary; snapshots only store metadata
            let record = null;
            if (db) {
                const row = db
                    .prepare(`
            SELECT summary_path as summaryPath, hotzones_path as hotzonesPath, proof_path as proofPath, tags
            FROM block_summaries WHERE chain = ? AND height = ?
          `)
                    .get(options.chain, block.number);
                if (row) {
                    record = {
                        height: Number(block.number),
                        blockHash: block.hash ?? '',
                        summaryPath: row.summaryPath,
                        hotzonesPath: row.hotzonesPath,
                        proofPath: row.proofPath,
                        tags: JSON.parse(row.tags ?? '[]'),
                    };
                }
            }
            if (!record) {
                record = {
                    height: Number(block.number),
                    blockHash: block.hash ?? '',
                    summaryPath: '',
                    hotzonesPath: '',
                    proofPath: '',
                    tags: [],
                };
            }
            snapshotEntries.push(record);
        });
        await writeSnapshot(snapshotPath, { chain: options.chain, entries: snapshotEntries });
        snapshots.push(...snapshotEntries);
    }
    // eslint-disable-next-line no-console
    console.log(`[backfill] Completed. Snapshots stored under ${options.snapshotDir}`);
    db?.close();
}
async function fetchChunk(provider, start, end) {
    const heights = [];
    for (let height = start; height >= end; height -= 1) {
        heights.push(height);
    }
    const blocks = await Promise.all(heights.map((height) => provider.getBlock(height, true)));
    return blocks.filter((block) => Boolean(block));
}
async function writeSnapshot(path, payload) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path, JSON.stringify(payload, null, 2), 'utf-8');
}
function parseArgs(argv) {
    const options = {
        chain: 'eth',
        rpcUrl: process.env.ETH_RPC_URL ?? 'https://eth.llamarpc.com',
        startHeight: 0,
        count: 10_000,
        chunkSize: 100,
        snapshotDir: resolve('artifacts', 'snapshots'),
        env: {},
    };
    argv.forEach((token) => {
        if (token.startsWith('--chain=')) {
            options.chain = token.slice('--chain='.length);
        }
        else if (token.startsWith('--rpc=')) {
            options.rpcUrl = token.slice('--rpc='.length);
        }
        else if (token.startsWith('--start=')) {
            options.startHeight = Number.parseInt(token.slice('--start='.length), 10);
        }
        else if (token.startsWith('--count=')) {
            options.count = Number.parseInt(token.slice('--count='.length), 10);
        }
        else if (token.startsWith('--chunk=')) {
            options.chunkSize = Number.parseInt(token.slice('--chunk='.length), 10);
        }
        else if (token.startsWith('--out=')) {
            options.snapshotDir = resolve(token.slice('--out='.length));
        }
    });
    return options;
}
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        // eslint-disable-next-line no-console
        console.error(error);
        process.exitCode = 1;
    });
}
