import { NextResponse } from 'next/server';
import { searchBlocksByTag } from '@/lib/blocks';
import type { StoredBlockSummary } from '@/lib/blocks';
import { dedupeBlocks } from '@/lib/askUtils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tagsParam = searchParams.get('tags') ?? searchParams.get('tag');
  if (!tagsParam) {
    return NextResponse.json({ error: 'Missing tags parameter' }, { status: 400 });
  }
  const tags = tagsParam
    .split(',')
    .map((tag) => tag.trim().toUpperCase())
    .filter(Boolean);
  if (tags.length === 0) {
    return NextResponse.json({ error: 'No valid tags provided' }, { status: 400 });
  }
  const source = searchParams.get('source') ?? undefined;
  const limitParam = Number(searchParams.get('limit') ?? '20');
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 100)) : 20;

  const combined = dedupeBlocks(
    tags.flatMap((tag) => searchBlocksByTag(tag, source, limit)),
    limit,
  );

  return NextResponse.json({
    tags,
    source: source ?? null,
    results: combined,
  });
}


