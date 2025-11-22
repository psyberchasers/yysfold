import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ARTIFACTS_ROOT =
  process.env.DATA_DIR ?? path.resolve(process.cwd(), '..', 'artifacts');

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: { slug?: string[] } },
) {
  const segments = context.params.slug ?? [];
  if (segments.length === 0) {
    return NextResponse.json({ error: 'Missing artifact path' }, { status: 400 });
  }
  const requestedPath = path.join(ARTIFACTS_ROOT, ...segments);
  const normalized = path.normalize(requestedPath);
  if (!normalized.startsWith(ARTIFACTS_ROOT)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const data = await readFile(normalized);
    const ext = path.extname(normalized).toLowerCase();
    const contentType = getContentType(ext);
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Unable to read artifact' }, { status: 500 });
  }
}

function getContentType(ext: string) {
  if (ext === '.json') return 'application/json';
  if (ext === '.csv') return 'text/csv';
  if (ext === '.txt') return 'text/plain';
  return 'application/octet-stream';
}


