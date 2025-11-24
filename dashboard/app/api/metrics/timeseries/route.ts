import { NextResponse } from 'next/server';
import { queryTimeseries } from '@/lib/metrics';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const intervalParam = url.searchParams.get('interval');
  const interval = intervalParam === 'hour' ? 'hour' : 'day';
  const now = Date.now();
  const defaultFrom = now - 30 * DAY_MS;
  const from = Number(url.searchParams.get('from')) || defaultFrom;
  const to = Number(url.searchParams.get('to')) || now;
  const chainsParam = url.searchParams.get('chains');
  const chains = chainsParam
    ? chainsParam
        .split(',')
        .map((chain) => chain.trim())
        .filter(Boolean)
    : [];
  const tagsParam = url.searchParams.get('tags');
  const tags = tagsParam
    ? tagsParam
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  try {
    const data = queryTimeseries({
      from,
      to,
      interval,
      chains,
      tags,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error('metrics/timeseries failed:', error);
    return NextResponse.json(
      { error: 'Failed to query metrics' },
      { status: 500 },
    );
  }
}

