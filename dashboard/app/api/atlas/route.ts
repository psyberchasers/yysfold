import { NextResponse } from 'next/server';
import { fetchAtlas } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const range = url.searchParams.get('range') ?? '30d';
  const tagParams = url.searchParams.getAll('tags');
  const tags =
    tagParams.length > 0
      ? tagParams
      : url.searchParams.get('tags')
        ? (url.searchParams
            .get('tags')
            ?.split(',')
            .map((tag) => tag.trim())
            .filter(Boolean) as string[])
        : [];

  const data = await fetchAtlas(range, tags);
  
  if (!data) {
    return NextResponse.json({ error: 'Atlas not available' }, { status: 503 });
  }

  return NextResponse.json(data.graph);
}
