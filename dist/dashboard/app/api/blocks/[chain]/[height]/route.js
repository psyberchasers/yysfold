"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const server_1 = require("next/server");
const blocks_1 = require("@/lib/blocks");
const node_fs_1 = require("node:fs");
async function GET(_request, context) {
    const height = Number(context.params.height);
    if (!Number.isFinite(height)) {
        return server_1.NextResponse.json({ error: 'Invalid height' }, { status: 400 });
    }
    const summary = (0, blocks_1.getBlockSummary)(context.params.chain, height);
    if (!summary) {
        return server_1.NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const summaryPayload = JSON.parse((0, node_fs_1.readFileSync)(summary.summaryPath, 'utf-8'));
    return server_1.NextResponse.json({
        ...summary,
        summary: summaryPayload,
    });
}
