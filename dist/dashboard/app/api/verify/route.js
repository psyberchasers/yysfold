"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.POST = POST;
const server_1 = require("next/server");
const node_crypto_1 = __importDefault(require("node:crypto"));
const blocks_1 = require("@/lib/blocks");
const node_fs_1 = require("node:fs");
async function POST(request) {
    let body = {};
    try {
        body = await request.json();
    }
    catch {
        return server_1.NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    if (!body.chain || body.height === undefined) {
        return server_1.NextResponse.json({ error: 'chain and height are required' }, { status: 400 });
    }
    const height = Number(body.height);
    if (!Number.isFinite(height)) {
        return server_1.NextResponse.json({ error: 'Invalid height' }, { status: 400 });
    }
    const record = (0, blocks_1.getBlockSummary)(body.chain, height);
    if (!record) {
        return server_1.NextResponse.json({ error: 'Block not found' }, { status: 404 });
    }
    const summary = JSON.parse((0, node_fs_1.readFileSync)(record.summaryPath, 'utf-8'));
    const proofHex = summary.proofHex;
    if (typeof proofHex !== 'string') {
        return server_1.NextResponse.json({ error: 'Proof not available for this block' }, { status: 422 });
    }
    const digest = node_crypto_1.default.createHash('sha256').update(proofHex).digest('hex');
    return server_1.NextResponse.json({
        status: 'ok',
        digest,
        commitments: summary.commitments,
        codebookRoot: summary.codebookRoot,
    });
}
