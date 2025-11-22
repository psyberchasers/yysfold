"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLatestBlockSummary = getLatestBlockSummary;
exports.getBlockSummary = getBlockSummary;
exports.listRecentBlockSummaries = listRecentBlockSummaries;
exports.searchBlockSummaries = searchBlockSummaries;
const db_1 = require("./db");
const node_path_1 = __importDefault(require("node:path"));
function getLatestBlockSummary() {
    const db = (0, db_1.getDatabase)();
    const row = db
        .prepare(`
    SELECT chain, height, block_hash as blockHash, timestamp, block_path as blockPath,
           summary_path as summaryPath, hotzones_path as hotzonesPath, proof_path as proofPath,
           tags
    FROM block_summaries
    ORDER BY datetime(created_at) DESC
    LIMIT 1
    `)
        .get();
    if (!row)
        return null;
    return normalizeRow(row);
}
function getBlockSummary(chain, height) {
    const db = (0, db_1.getDatabase)();
    const row = db
        .prepare(`
    SELECT chain, height, block_hash as blockHash, timestamp, block_path as blockPath,
           summary_path as summaryPath, hotzones_path as hotzonesPath, proof_path as proofPath,
           tags
    FROM block_summaries
    WHERE chain = ? AND height = ?
    LIMIT 1
    `)
        .get(chain, height);
    if (!row)
        return null;
    return normalizeRow(row);
}
function listRecentBlockSummaries(limit = 12, tagFilter) {
    const db = (0, db_1.getDatabase)();
    const rows = db
        .prepare(`
    SELECT chain, height, block_hash as blockHash, timestamp, block_path as blockPath,
           summary_path as summaryPath, hotzones_path as hotzonesPath, proof_path as proofPath,
           tags
    FROM block_summaries
    ORDER BY datetime(created_at) DESC
    LIMIT ?
    `)
        .all(limit);
    let normalized = rows.map((row) => normalizeRow(row));
    if (tagFilter) {
        const lower = tagFilter.toLowerCase();
        normalized = normalized.filter((row) => row.tags?.some((tag) => tag.toLowerCase().includes(lower)));
    }
    return normalized;
}
function searchBlockSummaries(query, limit = 20) {
    if (!query.trim())
        return [];
    const db = (0, db_1.getDatabase)();
    const rows = db
        .prepare(`
    SELECT chain, height, block_hash as blockHash, timestamp, block_path as blockPath,
           summary_path as summaryPath, hotzones_path as hotzonesPath, proof_path as proofPath,
           tags
    FROM block_summaries
    ORDER BY datetime(created_at) DESC
    LIMIT 200
    `)
        .all();
    const normalized = rows.map((row) => normalizeRow(row));
    const lower = query.toLowerCase();
    return normalized
        .filter((row) => {
        if (row.chain.toLowerCase().includes(lower))
            return true;
        if (row.blockHash.toLowerCase().includes(lower))
            return true;
        if (row.height.toString().includes(lower))
            return true;
        if (row.tags?.some((tag) => tag.toLowerCase().includes(lower)))
            return true;
        return false;
    })
        .slice(0, limit);
}
function normalizeRow(row) {
    const parseTags = (() => {
        try {
            return Array.isArray(JSON.parse(row.tags))
                ? JSON.parse(row.tags)
                : [];
        }
        catch {
            return [];
        }
    })();
    const baseDir = process.env.DATA_DIR ?? node_path_1.default.resolve('..', 'artifacts');
    return {
        chain: row.chain,
        height: Number(row.height),
        blockHash: row.blockHash,
        timestamp: Number(row.timestamp),
        blockPath: node_path_1.default.join(baseDir, relativeFromArtifacts(row.blockPath)),
        summaryPath: node_path_1.default.join(baseDir, relativeFromArtifacts(row.summaryPath)),
        hotzonesPath: node_path_1.default.join(baseDir, relativeFromArtifacts(row.hotzonesPath)),
        proofPath: node_path_1.default.join(baseDir, relativeFromArtifacts(row.proofPath)),
        tags: parseTags,
    };
}
function relativeFromArtifacts(target) {
    const artifactsDir = node_path_1.default.resolve('..', 'artifacts');
    if (target.startsWith(artifactsDir)) {
        return node_path_1.default.relative(artifactsDir, target);
    }
    return target;
}
