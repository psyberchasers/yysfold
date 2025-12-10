import { NextResponse } from 'next/server';
import { fetchBlockDetail } from '@/lib/api';

interface RouteContext {
  params: Promise<{ chain: string; height: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const height = Number(params.height);
  
  if (!Number.isFinite(height)) {
    return NextResponse.json({ error: 'Invalid height' }, { status: 400 });
  }
  
  const data = await fetchBlockDetail(params.chain, height);
  
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  
  return NextResponse.json({
    ...data.record,
    summary: data.payload,
    rawBlock: data.rawBlock,
    anomaly: data.anomaly,
    regime: data.regime,
    chainMeta: data.chainMeta,
    lendingTransactions: data.lendingTransactions,
  });
}
