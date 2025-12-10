import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request) {
  // Metrics require local SQLite database - not available on Vercel
  // TODO: Add metrics endpoint to Render API
  return NextResponse.json({
    histogram: [],
    stats: {
      average: 0,
      p50: 0,
      p95: 0,
      max: 0,
      count: 0,
    },
    note: 'Metrics available on Render backend',
  });
}
