import { NextResponse } from 'next/server';
import { filterAtlas, loadAtlasGraph } from '@/lib/atlas';

export async function GET(request: Request) {
  const graph = loadAtlasGraph();
  if (!graph) {
    return NextResponse.json({ error: 'Atlas not built. Run npm run atlas:build.' }, { status: 503 });
  }

  const url = new URL(request.url);
  const from = parseNumber(url.searchParams.get('from'));
  const to = parseNumber(url.searchParams.get('to'));
  const limit = parseInt(url.searchParams.get('limit') ?? '', 10);
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

  const filtered = filterAtlas(graph, {
    from: from ?? undefined,
    to: to ?? undefined,
    tags,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
  });

  return NextResponse.json(filtered);
}

function parseNumber(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

