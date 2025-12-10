import { NextRequest, NextResponse } from 'next/server';
import { fetchRecentBlocks } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') ?? '12', 10);
  const tag = searchParams.get('tag') ?? undefined;
  const chain = searchParams.get('chain') ?? undefined;

  const data = await fetchRecentBlocks(limit, tag, chain);
  
  if (!data) {
    return NextResponse.json({ blocks: [] });
  }
  
  return NextResponse.json(data);
}
