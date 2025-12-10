import { NextResponse } from 'next/server';
import { fetchDashboardData } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const data = await fetchDashboardData();
  
  if (!data?.summary) {
    return NextResponse.json({ error: 'No ingested blocks yet' }, { status: 404 });
  }
  
  return NextResponse.json({
    ...data.summary,
    summary: data.payload,
  });
}
