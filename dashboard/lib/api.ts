/**
 * API client for fetching data from Render backend
 * Used when running on Vercel (no local SQLite/artifacts)
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'https://yysfold.onrender.com';

export async function fetchFromAPI<T>(endpoint: string): Promise<T | null> {
  try {
    const url = `${API_BASE}${endpoint}`;
    const res = await fetch(url, {
      next: { revalidate: 5 }, // Cache for 5 seconds
    });
    if (!res.ok) {
      console.warn(`[api] ${endpoint} returned ${res.status}`);
      return null;
    }
    return res.json();
  } catch (error) {
    console.warn(`[api] Failed to fetch ${endpoint}:`, error);
    return null;
  }
}

export async function fetchDashboardData(tagFilter?: string) {
  const params = tagFilter ? `?tag=${encodeURIComponent(tagFilter)}` : '';
  return fetchFromAPI<{
    summary: any;
    payload: any;
    recent: any[];
    spotlights: any[];
    chains: string[];
    mempoolSnapshots: any[];
    predictions: any[];
  }>(`/dashboard${params}`);
}

export async function fetchRecentBlocks(limit = 12, tag?: string, chain?: string) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  if (tag) params.set('tag', tag);
  if (chain) params.set('chain', chain);
  return fetchFromAPI<{ blocks: any[] }>(`/blocks/recent?${params.toString()}`);
}

export async function fetchBlockDetail(chain: string, height: number) {
  return fetchFromAPI<{
    record: any;
    payload: any;
    rawBlock: any;
    anomaly: any;
    regime: any;
    chainMeta: any;
    lendingTransactions: any[];
  }>(`/blocks/${chain}/${height}`);
}

export async function fetchMempool() {
  return fetchFromAPI<{
    snapshots: any[];
    predictions: any[];
  }>('/mempool');
}

export async function fetchAtlas(range = '30d', tags?: string[]) {
  const params = new URLSearchParams();
  params.set('range', range);
  if (tags?.length) params.set('tags', tags.join(','));
  return fetchFromAPI<{
    graph: any;
    from: number;
    to: number;
  }>(`/atlas?${params.toString()}`);
}

export function getHeartbeatURL() {
  return `${API_BASE}/heartbeat`;
}

export { API_BASE };

