import { NextResponse } from 'next/server';
import { getLatestBlockSummary } from '@/lib/blocks';
import { readFileSync } from 'node:fs';

export async function GET() {
  const summary = getLatestBlockSummary();
  if (!summary) {
    return NextResponse.json({ error: 'No ingested blocks yet' }, { status: 404 });
  }
  const summaryPayload = JSON.parse(readFileSync(summary.summaryPath, 'utf-8'));
  return NextResponse.json({
    ...summary,
    summary: summaryPayload,
  });
}

