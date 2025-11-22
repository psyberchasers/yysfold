import { NextResponse } from 'next/server';
import { getBlockSummary } from '@/lib/blocks';
import { readFileSync } from 'node:fs';

interface RouteContext {
  params: { chain: string; height: string };
}

export async function GET(_request: Request, context: RouteContext) {
  const height = Number(context.params.height);
  if (!Number.isFinite(height)) {
    return NextResponse.json({ error: 'Invalid height' }, { status: 400 });
  }
  const summary = getBlockSummary(context.params.chain, height);
  if (!summary) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const summaryPayload = JSON.parse(readFileSync(summary.summaryPath, 'utf-8'));
  const rawBlock = JSON.parse(readFileSync(summary.blockPath, 'utf-8'));
  return NextResponse.json({
    ...summary,
    summary: summaryPayload,
    rawBlock,
  });
}

