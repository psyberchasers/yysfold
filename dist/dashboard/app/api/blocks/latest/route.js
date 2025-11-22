"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const server_1 = require("next/server");
const blocks_1 = require("@/lib/blocks");
const node_fs_1 = require("node:fs");
async function GET() {
    const summary = (0, blocks_1.getLatestBlockSummary)();
    if (!summary) {
        return server_1.NextResponse.json({ error: 'No ingested blocks yet' }, { status: 404 });
    }
    const summaryPayload = JSON.parse((0, node_fs_1.readFileSync)(summary.summaryPath, 'utf-8'));
    return server_1.NextResponse.json({
        ...summary,
        summary: summaryPayload,
    });
}
