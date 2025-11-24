import { NextResponse } from 'next/server';
import { queryPQResidualHistogram } from '../../../../lib/pqMetrics';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chain = searchParams.get('chain') ?? undefined;
  const hoursParam = Number(searchParams.get('hours') ?? '24');
  const bucketsParam = Number(searchParams.get('buckets') ?? '24');
  const now = Math.floor(Date.now() / 1000);
  const hours = Number.isFinite(hoursParam) && hoursParam > 0 ? hoursParam : 24;
  const from = now - Math.floor(hours * 60 * 60);
  const result = queryPQResidualHistogram({
    chain: chain === 'all' ? undefined : chain,
    from,
    to: now,
    bucketCount: Number.isFinite(bucketsParam) && bucketsParam > 0 ? bucketsParam : 24,
  });
  return NextResponse.json(result);
}

