import Link from 'next/link';
import dynamic from 'next/dynamic';
const HypergraphView3D = dynamic(() => import('@/components/HypergraphView3D'), { ssr: false });
const LatentExplorer = dynamic(() => import('@/components/LatentExplorer'), { ssr: false });
import { AtlasHeatmap } from '@/components/AtlasHeatmap';
import { filterAtlas, loadAtlasGraph } from '@/lib/atlas';
import { fetchFromDataApi, isRemoteDataEnabled } from '@/lib/dataSource';

export const metadata = {
  title: 'Atlas · YYSFOLD',
};

interface AtlasPageProps {
  searchParams?: {
    range?: string;
    tags?: string;
  };
}

const RANGE_TO_MS: Record<string, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};
const TAG_OPTIONS = ['AML_ALERT', 'DEX_ACTIVITY', 'NFT_ACTIVITY', 'LENDING_ACTIVITY', 'HIGH_FEE'];

export default async function AtlasPage({ searchParams }: AtlasPageProps) {
  const range = typeof searchParams?.range === 'string' ? searchParams.range : '30d';
  const rawTags = searchParams?.tags;
  const selectedTags = Array.isArray(rawTags)
    ? rawTags
    : typeof rawTags === 'string'
      ? rawTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : [];
  const atlasData = await loadFilteredAtlas(range, selectedTags);

  if (!atlasData) {
    return (
      <main className="min-h-screen bg-white text-gray-900 px-10 py-10">
        <div className="max-w-6xl mx-auto space-y-4">
          <Link href="/" className="text-sm text-gray-500 hover:text-accent">
            ← Back to dashboard
          </Link>
          <div className="border border-gray-200 rounded-none p-6 bg-white">
            <h1 className="text-2xl font-semibold text-gray-900">Global atlas</h1>
            <p className="text-sm text-gray-500">
              No atlas data found. Run <code className="font-mono">npm run atlas:build</code> after
              ingesting blocks to generate the aggregated hypergraph.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { graph: filtered, from, to } = atlasData;
  const latentNodes = filtered.nodes.map((node) => ({
    id: `cluster-${node.id}`,
    center: node.centroid ?? [],
    density: node.avgDensity ?? 0,
    semanticTags: node.tags ?? [],
  }));

  return (
    <main className="min-h-screen bg-white text-gray-900 px-10 py-10">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-col gap-3">
          <Link href="/" className="text-sm text-gray-500 hover:text-accent">
            ← Back to dashboard
          </Link>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Behavioral atlas</p>
            <h1 className="text-3xl font-semibold text-gray-900">Global hypergraph</h1>
            <p className="text-sm text-gray-500">
              Showing {filtered.nodes.length} clusters · {filtered.edges.length} relationships
            </p>
          </div>
        </header>
        <section className="bg-white border border-gray-200 rounded-none p-6 shadow-sm space-y-4">
          <form className="flex flex-wrap items-end gap-4 text-sm" method="get">
            <div className="flex flex-col gap-1">
              <label className="text-xs uppercase tracking-wide text-gray-500">Range</label>
              <select
                name="range"
                defaultValue={range}
                className="border border-gray-300 px-3 py-2 rounded-none text-sm"
              >
                {Object.keys(RANGE_TO_MS).map((option) => (
                  <option key={option} value={option}>
                    {option.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-500">Tags</span>
              <div className="flex flex-wrap gap-2">
                {TAG_OPTIONS.map((tag) => (
                  <label
                    key={tag}
                    className={`px-3 py-1 border rounded-full cursor-pointer ${
                      selectedTags.includes(tag) ? 'border-accent text-accent' : 'border-gray-300 text-gray-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="tags"
                      value={tag}
                      defaultChecked={selectedTags.includes(tag)}
                      className="sr-only"
                    />
                    {tag.replace('_', ' ')}
                  </label>
                ))}
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-gray-900 text-white text-xs uppercase tracking-wide rounded-none"
            >
              Apply
            </button>
            {selectedTags.length > 0 && (
              <Link href={`/atlas?range=${range}`} className="text-xs text-accent underline">
                Clear tags
              </Link>
            )}
          </form>
          <div className="flex flex-wrap gap-3 text-xs text-gray-600 mb-4">
            <span className="px-3 py-1 border border-gray-300 rounded-full">
              Range: {range.toUpperCase()}
            </span>
            {selectedTags.length > 0 ? (
              selectedTags.map((tag) => (
                <span key={tag} className="px-3 py-1 border border-gray-300 rounded-full">
                  Tag: {tag.toUpperCase()}
                </span>
              ))
            ) : (
              <span className="px-3 py-1 border border-gray-200 rounded-full text-gray-500">
                All tags
              </span>
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="h-[520px] border border-gray-200">
              <AtlasViewer graph={filtered} />
            </div>
            <div className="h-[520px] border border-gray-200">
              <AtlasHeatmap nodes={filtered.nodes} from={from} to={to} />
            </div>
          </div>
        </section>
        <section className="bg-white border border-gray-200 rounded-none p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Latent explorer (atlas)</h2>
              <p className="text-sm text-gray-500">
                Global cluster centroids rendered with the same 3D context as block detail pages.
              </p>
            </div>
            <span className="text-xs uppercase tracking-wide text-gray-500">
              {latentNodes.length} clusters
            </span>
          </div>
          <div className="h-[520px] border border-gray-200">
            <LatentExplorer hotzones={latentNodes} />
          </div>
        </section>
        <section className="bg-white border border-gray-200 rounded-none p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Top clusters</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {filtered.nodes
              .slice()
              .sort((a, b) => b.count - a.count)
              .slice(0, 6)
              .map((node) => (
                <article key={node.id} className="border border-gray-200 rounded-none p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-500">
                    Cluster #{node.id}
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">{node.count} samples</p>
                  <p className="text-sm text-gray-500">
                    Chains: {node.chains.join(', ') || '—'}
                  </p>
                  <p className="text-sm text-gray-500">
                    Tags:{' '}
                    {node.tags.length > 0
                      ? node.tags.join(', ')
                      : 'No dominant semantic tags'}
                  </p>
                </article>
              ))}
          </div>
        </section>
      </div>
    </main>
  );
}

async function loadFilteredAtlas(range: string, tags: string[]) {
  if (isRemoteDataEnabled()) {
    try {
      const params = new URLSearchParams();
      params.set('range', range);
      if (tags.length > 0) {
        params.set('tags', tags.join(','));
      }
      return await fetchFromDataApi<{ graph: ReturnType<typeof filterAtlas>; from: number; to: number }>(
        `/atlas?${params.toString()}`,
      );
    } catch (error) {
      console.warn('[atlas] remote fetch failed, falling back to local data source', error);
    }
  }
  const graph = loadAtlasGraph();
  if (!graph || graph.nodes.length === 0) {
    return null;
  }
  const now = Date.now();
  const from = now - (RANGE_TO_MS[range] ?? RANGE_TO_MS['30d']);
  const filtered = filterAtlas(graph, {
    from,
    to: now,
    tags,
  });
  return { graph: filtered, from, to: now };
}

function AtlasViewer({ graph }: { graph: ReturnType<typeof filterAtlas> }) {
  const nodeIndexMap = new Map<number, number>();
  graph.nodes.forEach((node, index) => nodeIndexMap.set(node.id, index));
  return (
    <HypergraphView3D
      nodes={graph.nodes.map((node) => ({
        id: `cluster-${node.id}`,
        density: node.avgDensity,
        semanticTags: node.tags,
      }))}
      edges={graph.edges
        .map((edge) => {
          const sourceIndex = nodeIndexMap.get(edge.source);
          const targetIndex = nodeIndexMap.get(edge.target);
          if (sourceIndex === undefined || targetIndex === undefined) return null;
          return {
            nodes: [sourceIndex, targetIndex],
            weight: edge.weight,
          };
        })
        .filter(Boolean) as { nodes: number[]; weight: number }[]}
    />
  );
}

