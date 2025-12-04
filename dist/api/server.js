import cors from 'cors';
import express from 'express';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { computeAnomalyScore } from '../shared/dashboard-lib/anomaly.js';
import { loadAtlasGraph, filterAtlas } from '../shared/dashboard-lib/atlas.js';
import { getBlockSummary, getLatestBlockSummary, getTagStats, listRecentBlockSummaries, listSources, } from '../shared/dashboard-lib/blocks.js';
import { getChainMetadata } from '../shared/dashboard-lib/chains.js';
import { readLatestMempoolSnapshots } from '../shared/dashboard-lib/mempool.js';
import { readLatestPredictions } from '../shared/dashboard-lib/predictions.js';
import { summarizeBehaviorRegime } from '../shared/dashboard-lib/regime.js';
import { findLendingTransactions } from '../shared/dashboard-lib/tagEvidence.js';
const DEFAULT_DATA_DIR = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'artifacts');
process.env.DATA_DIR = DEFAULT_DATA_DIR;
const HEARTBEAT_EVENT_MS = parseInt(process.env.SSE_HEARTBEAT_INTERVAL_MS ?? '5000', 10);
const HEARTBEAT_INTERVAL_MS = Number.isFinite(HEARTBEAT_EVENT_MS) ? HEARTBEAT_EVENT_MS : 5000;
const SPOTLIGHT_TAGS = [
    'NFT_ACTIVITY',
    'DEX_ACTIVITY',
    'HIGH_FEE',
    'LARGE_VALUE',
    'LENDING_ACTIVITY',
];
const app = express();
app.use(cors({
    origin: process.env.CORS_ORIGIN?.split(',').map((value) => value.trim()).filter(Boolean) ?? '*',
}));
app.use(express.json({ limit: '1mb' }));
app.get('/healthz', (_req, res) => {
    const summary = getLatestBlockSummary();
    res.json({
        status: 'ok',
        timestamp: Date.now(),
        latestBlock: summary
            ? {
                chain: summary.chain,
                height: summary.height,
                timestamp: summary.timestamp,
            }
            : null,
    });
});
app.get('/dashboard', (req, res) => {
    try {
        const tagFilter = typeof req.query.tag === 'string' ? req.query.tag : undefined;
        const data = loadDashboardData(tagFilter);
        res.json(data);
    }
    catch (error) {
        console.error('[api] dashboard error', error);
        res.status(500).json({ error: 'Failed to load dashboard data' });
    }
});
app.get('/blocks/recent', (req, res) => {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit ?? '12', 10) || 12));
    const tagFilter = typeof req.query.tag === 'string' ? req.query.tag : undefined;
    const chainFilter = typeof req.query.chain === 'string' ? req.query.chain : undefined;
    const blocks = listRecentBlockSummaries(limit, tagFilter).filter((block) => {
        if (!chainFilter)
            return true;
        return block.chain.toLowerCase() === chainFilter.toLowerCase();
    });
    res.json({ blocks });
});
app.get('/blocks/:chain/:height', (req, res) => {
    const { chain } = req.params;
    const height = Number(req.params.height);
    if (!Number.isFinite(height)) {
        return res.status(400).json({ error: 'Invalid height parameter' });
    }
    const record = getBlockSummary(chain, height);
    if (!record) {
        return res.status(404).json({ error: 'Block not found' });
    }
    try {
        const payload = JSON.parse(readFileSync(record.summaryPath, 'utf-8'));
        const rawBlock = JSON.parse(readFileSync(record.blockPath, 'utf-8'));
        const hotzones = payload.hotzones ?? [];
        const pqResidualStats = payload.pqResidualStats;
        const tags = payload.semanticTags ?? record.tags ?? [];
        const anomaly = computeAnomalyScore({
            hotzones,
            pqResidualStats,
            tagVector: tags,
        });
        const regime = summarizeBehaviorRegime(hotzones);
        const chainMeta = getChainMetadata(record.chain);
        const lendingTransactions = findLendingTransactions(record.blockPath, 50);
        return res.json({
            record,
            payload,
            rawBlock,
            anomaly,
            regime,
            chainMeta,
            lendingTransactions,
        });
    }
    catch (error) {
        console.error('[api] block detail error', error);
        return res.status(500).json({ error: 'Failed to load block detail' });
    }
});
app.get('/mempool', (_req, res) => {
    try {
        const snapshots = readLatestMempoolSnapshots();
        const predictions = readLatestPredictions();
        res.json({ snapshots, predictions });
    }
    catch (error) {
        console.error('[api] mempool error', error);
        res.status(500).json({ error: 'Failed to load mempool data' });
    }
});
app.get('/atlas', (req, res) => {
    try {
        const graph = loadAtlasGraph();
        if (!graph) {
            return res.status(404).json({ error: 'Atlas not generated yet' });
        }
        const now = Date.now();
        const range = typeof req.query.range === 'string' ? req.query.range : '30d';
        const ranges = {
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
            '90d': 90 * 24 * 60 * 60 * 1000,
        };
        const from = now - (ranges[range] ?? ranges['30d']);
        const tagsParam = req.query.tags;
        const tags = typeof tagsParam === 'string'
            ? tagsParam
                .split(',')
                .map((tag) => tag.trim())
                .filter((tag) => tag.length > 0)
            : Array.isArray(tagsParam)
                ? tagsParam.map((value) => String(value))
                : [];
        const filtered = filterAtlas(graph, { from, to: now, tags });
        res.json({ graph: filtered, from, to: now });
    }
    catch (error) {
        console.error('[api] atlas error', error);
        res.status(500).json({ error: 'Failed to load atlas' });
    }
});
app.get('/artifacts/*', (req, res) => {
    const relativePath = req.params['0'];
    if (!relativePath) {
        return res.status(400).json({ error: 'Missing artifact path' });
    }
    const targetPath = path.resolve(DEFAULT_DATA_DIR, relativePath);
    if (!targetPath.startsWith(DEFAULT_DATA_DIR)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    if (!existsSync(targetPath) || !statSync(targetPath).isFile()) {
        return res.status(404).json({ error: 'Artifact not found' });
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    createReadStream(targetPath).pipe(res);
});
app.get('/heartbeat', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const send = () => {
        const summary = getLatestBlockSummary();
        const payload = buildHeartbeatPayload(summary);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    send();
    const interval = setInterval(send, HEARTBEAT_INTERVAL_MS);
    req.on('close', () => {
        clearInterval(interval);
    });
});
function loadDashboardData(tagFilter) {
    const summary = getLatestBlockSummary();
    if (!summary) {
        return {
            summary: null,
            payload: null,
            recent: [],
            spotlights: [],
            chains: [],
            mempoolSnapshots: [],
            predictions: [],
        };
    }
    const payload = JSON.parse(readFileSync(summary.summaryPath, 'utf-8'));
    const recent = listRecentBlockSummaries(12, tagFilter);
    const spotlights = SPOTLIGHT_TAGS.map((tag) => getTagStats(tag));
    const chains = listSources();
    const mempoolSnapshots = readLatestMempoolSnapshots();
    const predictions = readLatestPredictions();
    return { summary, payload, recent, spotlights, chains, mempoolSnapshots, predictions };
}
function buildHeartbeatPayload(summary) {
    const mempool = readLatestMempoolSnapshots();
    const predictions = readLatestPredictions();
    return {
        status: summary ? 'ok' : 'empty',
        digest: summary ? `${summary.chain}-${summary.height}-${summary.blockHash}` : null,
        chain: summary?.chain ?? null,
        height: summary?.height ?? null,
        timestamp: summary?.timestamp ?? null,
        mempool,
        predictions,
    };
}
const port = Number.parseInt(process.env.PORT ?? '8080', 10);
app.listen(port, () => {
    console.log(`[api] listening on ${port}, data dir ${DEFAULT_DATA_DIR}`);
});
export default app;
