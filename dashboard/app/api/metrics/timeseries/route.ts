import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request) {
  // Timeseries metrics require local SQLite database - not available on Vercel
  // TODO: Add timeseries endpoint to Render API
  return NextResponse.json({
    data: [],
    note: 'Timeseries metrics available on Render backend',
  });
}
