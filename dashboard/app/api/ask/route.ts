import { NextResponse } from 'next/server';
import { searchBlocksByTag } from '@/lib/blocks';
import type { StoredBlockSummary } from '@/lib/blocks';
import { dedupeBlocks, inferTags, buildSummary } from '@/lib/askUtils';

interface AskRequest {
  question?: string;
  source?: string;
  limit?: number;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as AskRequest;
  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: 'Missing question' }, { status: 400 });
  }
  const source = body.source?.trim() || undefined;
  const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(body.limit ?? 10, 50)) : 10;

  const inferredTags = inferTags(question);
  if (inferredTags.length === 0) {
    return NextResponse.json({
      question,
      inferredTags: [],
      results: [],
      summary: 'No specific tags detected. Try mentioning NFT, DEX, AML, FX, etc.',
    });
  }

  const results = dedupeBlocks(
    inferredTags.flatMap((tag) => searchBlocksByTag(tag, source, limit)),
    limit,
  );

  const summary =
    results.length === 0
      ? `No blocks found for tags ${inferredTags.join(', ')}${source ? ` in source ${source}` : ''}.`
      : buildSummary(question, inferredTags, results.slice(0, 3));

  return NextResponse.json({
    question,
    source: source ?? null,
    inferredTags,
    summary,
    results,
  });
}


