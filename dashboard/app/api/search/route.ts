import { NextResponse } from 'next/server';
import { fetchRecentBlocks } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q') ?? '';
  
  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }
  
  // Fetch recent blocks and filter client-side
  // TODO: Add search endpoint to Render API for better performance
  const data = await fetchRecentBlocks(100);
  
  if (!data?.blocks) {
    return NextResponse.json({ results: [] });
  }
  
  const lower = query.toLowerCase();
  const results = data.blocks.filter((block: any) => {
    if (block.chain?.toLowerCase().includes(lower)) return true;
    if (block.blockHash?.toLowerCase().includes(lower)) return true;
    if (String(block.height).includes(lower)) return true;
    if (block.tags?.some((tag: string) => tag.toLowerCase().includes(lower))) return true;
    return false;
  }).slice(0, 20);
  
  return NextResponse.json({ results });
}
