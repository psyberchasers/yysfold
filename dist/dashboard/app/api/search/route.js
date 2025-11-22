"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const server_1 = require("next/server");
const blocks_1 = require("@/lib/blocks");
async function GET(request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') ?? '';
    if (!query.trim()) {
        return server_1.NextResponse.json({ results: [] });
    }
    const limitParam = Number(searchParams.get('limit') ?? '20');
    const limit = Number.isFinite(limitParam)
        ? Math.min(Math.max(limitParam, 1), 50)
        : 20;
    const results = (0, blocks_1.searchBlockSummaries)(query, limit);
    return server_1.NextResponse.json({ results });
}
