import { NextResponse } from 'next/server';
import { searchBlockSummaries } from '@/lib/blocks';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') ?? '';
  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }
  const limitParam = Number(searchParams.get('limit') ?? '20');
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 50)
    : 20;
  const results = searchBlockSummaries(query, limit);
  return NextResponse.json({ results });
}

