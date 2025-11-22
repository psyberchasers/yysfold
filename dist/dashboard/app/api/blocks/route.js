"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const server_1 = require("next/server");
const blocks_1 = require("@/lib/blocks");
async function GET(request) {
    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get('limit') ?? '12');
    const tagFilter = searchParams.get('tag');
    const limit = Number.isFinite(limitParam)
        ? Math.min(Math.max(limitParam, 1), 50)
        : 12;
    const blocks = (0, blocks_1.listRecentBlockSummaries)(limit, tagFilter ?? undefined);
    return server_1.NextResponse.json({ blocks });
}
