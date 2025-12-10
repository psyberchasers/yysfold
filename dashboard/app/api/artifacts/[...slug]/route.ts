import { NextResponse } from 'next/server';
import { API_BASE } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug?: string[] }> },
) {
  const params = await context.params;
  const segments = params.slug ?? [];
  
  if (segments.length === 0) {
    return NextResponse.json({ error: 'Missing artifact path' }, { status: 400 });
  }
  
  // Proxy to Render backend
  const artifactPath = segments.join('/');
  const backendUrl = `${API_BASE}/artifacts/${artifactPath}`;
  
  try {
    const res = await fetch(backendUrl);
    
    if (!res.ok) {
      return NextResponse.json({ error: 'Not found' }, { status: res.status });
    }
    
    const data = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[artifacts] Proxy error:', error);
    return NextResponse.json({ error: 'Unable to fetch artifact' }, { status: 500 });
  }
}
