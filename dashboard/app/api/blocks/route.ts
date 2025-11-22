import { NextResponse } from 'next/server';
import { listRecentBlockSummaries } from '@/lib/blocks';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get('limit') ?? '12');
  const tagFilter = searchParams.get('tag');
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 50)
    : 12;

  const blocks = listRecentBlockSummaries(limit, tagFilter ?? undefined);

  return NextResponse.json({ blocks });
}

