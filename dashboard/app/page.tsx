import Link from 'next/link';
import { readFileSync } from 'node:fs';
import {
  getLatestBlockSummary,
  listRecentBlockSummaries,
  getTagStats,
  listSources,
  StoredBlockSummary,
  TagStats,
} from '@/lib/blocks';
import { getChainMetadata } from '@/lib/chains';
import { HotzoneCard } from '../components/HotzoneCard';
import { BlockHeatmap } from '../components/BlockHeatmap';
import { BlockProjection } from '../components/BlockProjection';
import { ProofPanel } from '../components/ProofPanel';
import { SemanticSearch } from '../components/SemanticSearch';
import { BlockPreview } from '../components/BlockPreview';
import { buildArtifactUrl } from '@/lib/artifacts';
import { CopyableText } from '../components/CopyableText';
import { MetricsChart } from '../components/MetricsChart';
import PQResidualHistogram from '../components/PQResidualHistogram';
import { summarizeBehaviorRegime } from '@/lib/regime';
import { computeAnomalyScore } from '@/lib/anomaly';
import dynamic from 'next/dynamic';
import LiveHeartbeatBadge from '../components/LiveHeartbeatBadge';
import PredictionCard from '../components/PredictionCard';
import { readLatestPredictions, type PredictionSignal } from '@/lib/predictions';
import { readLatestMempoolSnapshots, type MempoolSnapshot } from '@/lib/mempool';
import MempoolTicker from '../components/MempoolTicker';
import MempoolPanel from '../components/MempoolPanel';
import { fetchFromDataApi, isRemoteDataEnabled } from '@/lib/dataSource';

const HypergraphView3D = dynamic(() => import('../components/HypergraphView3D'), {
  ssr: false,
});

interface PageProps {
  searchParams?: { tag?: string };
}

const spotlightTags = ['NFT_ACTIVITY', 'DEX_ACTIVITY', 'HIGH_FEE', 'LARGE_VALUE', 'LENDING_ACTIVITY'];

interface DashboardDataPayload {
  summary: StoredBlockSummary | null;
  payload: any;
  recent: StoredBlockSummary[];
  spotlights: TagStats[];
  chains: string[];
  mempoolSnapshots: MempoolSnapshot[];
  predictions: PredictionSignal[];
}

async function loadDashboardData(tagFilter?: string): Promise<DashboardDataPayload> {
  if (isRemoteDataEnabled()) {
    try {
      const params = new URLSearchParams();
      if (tagFilter) {
        params.set('tag', tagFilter);
      }
      const query = params.size > 0 ? `?${params.toString()}` : '';
      return await fetchFromDataApi<DashboardDataPayload>(`/dashboard${query}`);
    } catch (error) {
      console.warn('[dashboard] remote data fetch failed, falling back to local data source', error);
    }
  }
  return loadDashboardDataFromFilesystem(tagFilter);
}

function loadDashboardDataFromFilesystem(tagFilter?: string): DashboardDataPayload {
  const summary = getLatestBlockSummary();
  if (!summary) {
    return {
      summary: null,
      payload: null,
      recent: [],
      spotlights: [],
      chains: [],
      mempoolSnapshots: [],
      predictions: [],
    };
  }
  const payload = JSON.parse(readFileSync(summary.summaryPath, 'utf-8'));
  const recent = listRecentBlockSummaries(12, tagFilter);
  const spotlights = spotlightTags.map((tag) => getTagStats(tag));
  const chains = listSources();
  const mempoolSnapshots = readLatestMempoolSnapshots();
  const predictions = readLatestPredictions();
  return { summary, payload, recent, spotlights, chains, mempoolSnapshots, predictions };
}

export default async function Page({ searchParams }: PageProps) {
  const tagFilter = searchParams?.tag || undefined;
  const chainFilter = searchParams?.chain || undefined;
  const data = await loadDashboardData(tagFilter);

  if (!data.summary || !data.payload) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-canvas text-gray-300">
        <p>No blocks ingested yet. Run `npm run ingest` to populate data.</p>
      </main>
    );
  }

  const { summary, payload, recent, spotlights, chains, mempoolSnapshots, predictions } = data;
  const hotzones = payload.hotzones ?? [];
  const hypergraph = payload.hypergraph ?? { nodes: [], hyperedges: [] };
  const tagFilters = ['NFT_ACTIVITY', 'DEX_ACTIVITY', 'HIGH_FEE', 'LARGE_VALUE'];
  const analyticCards = buildAnalyticsCards(summary, payload, hotzones);
  const chainOptions = ['ALL', ...chains];
  const latestChainMeta = getChainMetadata(summary.chain);
  const regime = summarizeBehaviorRegime(hotzones);
  const anomaly = computeAnomalyScore({
    hotzones,
    pqResidualStats: payload.pqResidualStats,
    tagVector: summary.semanticTags ?? [],
  });
  const filteredBlocks =
    chainFilter && chainFilter.toLowerCase() !== 'all'
      ? recent.filter((block) => block.chain === chainFilter)
      : recent;

  const totalHotzoneDensity =
    hotzones.reduce((sum, zone) => sum + Number(zone?.density ?? 0), 0) || 1;
  const initialPrediction =
    predictions.find((prediction) => prediction.chain === summary.chain) ?? predictions[0] ?? null;

  return (
    <main className="min-h-screen bg-white text-gray-900 px-10 py-10">
      <div className="max-w-7xl mx-auto flex flex-col gap-8">
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold tracking-tight text-gray-900">
              YYSFOLD · Blockchain Fingerprints
            </div>
            <nav className="flex gap-6 text-sm text-gray-600">
              <Link href="/" className="hover:text-gray-900">
                Dashboard
              </Link>
              <Link href="/analytics" className="hover:text-gray-900">
                Analytics
              </Link>
              <Link href="/adapters" className="hover:text-gray-900">
                Adapters
              </Link>
              <Link href="/atlas" className="hover:text-gray-900">
                Atlas
              </Link>
              <Link href="/chat" className="inline-flex items-center gap-2 px-3 py-1 border border-gray-300 uppercase tracking-wide text-xs hover:border-gray-500">
                Open AI chat
              </Link>
            </nav>
          </div>
          <div className="h-px bg-gray-200" />
        </header>
        <section className="bg-white rounded-3xl border border-gray-200 p-8 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-gray-500">
                Latest behavioral fingerprint
              </p>
              <h1 className="text-4xl font-semibold tracking-tight text-gray-900">
                {summary.chain} · #{summary.height}
              </h1>
              <p className="text-sm text-gray-600">{formatTimestamp(summary.timestamp)}</p>
              <div className="mt-3">
                <div className="flex flex-wrap gap-2">
                  {(summary.tags.length > 0 ? summary.tags : ['No tags']).map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 rounded-full border border-gray-300 text-xs uppercase tracking-wide text-gray-700"
                    >
                      {tag.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
                <div className="h-4" />
              </div>
            </div>
            <div className="flex min-w-[220px] flex-col items-end gap-3">
              <LiveHeartbeatBadge />
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-4 text-sm text-gray-700 md:grid-cols-4">
            <div className="flex flex-col gap-1">
              <span className="text-gray-500 uppercase tracking-wide text-xs">Block hash</span>
              <CopyableText value={summary.blockHash} label="block hash" truncateAt={16} className="text-gray-900" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-gray-500 uppercase tracking-wide text-xs">Artifacts</span>
              <div className="flex items-center gap-2">
                <a className="text-accent underline" href={buildArtifactUrl(summary.blockPath)}>
                  raw block
                </a>
                <span>·</span>
                <a className="text-accent underline" href={buildArtifactUrl(summary.proofPath)}>
                  proof
                </a>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-gray-500 uppercase tracking-wide text-xs">Regime</span>
              <span className="font-semibold text-gray-900">{regime.label}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-gray-500 uppercase tracking-wide text-xs">Anomaly</span>
              <div>
                <span className="font-semibold text-gray-900">
                  {anomaly.score.toFixed(2)} ({anomaly.label})
                </span>
                <p className="text-xs text-gray-500">
                  Density {anomaly.breakdown.density.detail} · PQ {anomaly.breakdown.pqResidual.detail} · Tags{' '}
                  {anomaly.breakdown.tags.detail}
                </p>
              </div>
            </div>
          </div>
        </section>

        <PredictionCard chain={summary.chain} initial={initialPrediction} />

        {mempoolSnapshots.length > 0 && (
          <section className="bg-white rounded-3xl border border-emerald-100/80 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-600">Incoming activity</p>
                <h2 className="text-lg font-semibold text-gray-900">Live mempool feed</h2>
              </div>
              <span className="text-xs text-emerald-700 uppercase tracking-wide">
                {mempoolSnapshots.length} chains
              </span>
            </div>
            <MempoolTicker initial={mempoolSnapshots} />
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <article className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">
                  Query the heartmap
                </p>
                <h2 className="text-lg font-semibold text-gray-900">Semantic search</h2>
              </div>
            </div>
            <SemanticSearch />
          </article>
          <article className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm flex flex-col gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Snapshot</p>
              <h2 className="text-lg font-semibold text-gray-900">Block summary</h2>
            </div>
            <dl className="space-y-3 text-sm text-gray-600">
              <div className="flex items-center justify-between">
                <dt className="text-gray-500 uppercase tracking-wide">Chain</dt>
                <dd className="font-semibold text-gray-900">{summary.chain}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-gray-500 uppercase tracking-wide">Height</dt>
                <dd className="font-semibold text-gray-900">#{summary.height}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-gray-500 uppercase tracking-wide">Relative age</dt>
                <dd className="font-semibold text-gray-900">{formatRelativeAge(summary.timestamp)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-gray-500 uppercase tracking-wide">Hotzones detected</dt>
                <dd className="font-semibold text-gray-900">{hotzones.length}</dd>
              </div>
            </dl>
            <div className="text-xs text-gray-500">
              Commitments hashed with the active codebook root and provable via Halo2.
            </div>
          </article>
        </section>

        <section>
          <MempoolPanel initial={mempoolSnapshots} />
        </section>

        <section className="grid gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {analyticCards.map((card) => (
            <article
              key={card.label}
              className="bg-white rounded-2xl border border-gray-200 px-4 py-3 shadow-sm flex flex-col gap-0.5"
            >
              <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500">{card.label}</p>
              <p className="text-2xl font-semibold text-gray-900">{card.value}{card.suffix ?? ''}</p>
              <p className="text-xs text-gray-500">{card.detail}</p>
            </article>
          ))}
        </section>

        <section>
          <MetricsChart />
        </section>

        <section>
          <PQResidualHistogram />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Tag spotlights</h2>
                <p className="text-sm text-gray-500">Tracked behaviors across the latest ingest</p>
              </div>
              <span className="text-xs uppercase tracking-[0.3em] text-gray-500">
                {spotlights.length} tags
              </span>
            </div>
            <div className="divide-y divide-gray-200">
              {spotlights.map((spotlight) => (
                <TagSpotlightCard key={spotlight.tag} spotlight={spotlight} />
              ))}
            </div>
          </article>
          <article className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
            <ProofPanel
              chain={summary.chain}
              height={summary.height}
              blockHash={summary.blockHash}
              commitments={payload.commitments ?? {}}
              codebookRoot={payload.codebookRoot}
              proofHex={payload.proofHex}
            />
          </article>
        </section>

        <section className="grid gap-6">
          <article className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Hotzone atlas</h2>
                <p className="text-sm text-gray-500">
                  Local KDE clusters for the latest block (top {Math.min(hotzones.length, 6)})
                </p>
              </div>
              <span className="text-xs text-gray-500 uppercase tracking-wide">
                Total hotzones: {hotzones.length}
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
            {hotzones.slice(0, 6).map((zone: any, index: number) => (
                <HotzoneCard
                  key={zone.id}
                  zone={zone}
                  order={index}
                chainLabel={latestChainMeta.symbol}
                  maxDensity={
                    hotzones.length > 0
                      ? Math.max(...hotzones.map((h: any) => h.density))
                      : 1
                  }
                  totalDensity={totalHotzoneDensity}
                />
              ))}
            </div>
          </article>

          <div className="grid gap-6 lg:grid-cols-2">
            <article className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Hypergraph view</h2>
                  <p className="text-sm text-gray-500">
                    {hypergraph.nodes?.length ?? 0} nodes ·{' '}
                    {hypergraph.hyperedges?.length ?? 0} hyperedges
                  </p>
                </div>
                <a className="text-accent underline text-sm" href={buildArtifactUrl(summary.hotzonesPath)}>
                  Download JSON
                </a>
              </div>
              <div className="h-[420px] border border-gray-200">
                <HypergraphView3D
                  nodes={hypergraph.nodes ?? []}
                  edges={hypergraph.hyperedges ?? []}
                />
              </div>
            </article>

            <article className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Block heatmap</h2>
                  <p className="text-sm text-gray-500">Intensity + tag presence across zones</p>
                </div>
                <span className="text-xs text-gray-500 uppercase tracking-wide">
                  Zones {hotzones.length}
                </span>
              </div>
              <div className="h-[420px]">
                <BlockHeatmap hotzones={hotzones.slice(0, 20)} />
              </div>
            </article>
          </div>
        </section>

        <section className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Projection (c0 vs c1)</h2>
              <p className="text-sm text-gray-500">
                Approximate 4D → 2D scatter for the latest block hotzones
              </p>
            </div>
          </div>
          <div className="h-[320px]">
            <BlockProjection hotzones={hotzones.slice(0, 40)} />
          </div>
        </section>

        <section
          id="recent-blocks"
          className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm mb-10"
        >
          <div className="flex flex-col gap-4 mb-4">
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Recent blocks</h2>
                <p className="text-sm text-gray-500">
                  Live timeline ({filteredBlocks.length} shown)
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <FilterChip label="All tags" active={!tagFilter} href={buildQueryHref({ chain: chainFilter })} />
                {tagFilters.map((tag) => (
                  <FilterChip
                    key={tag}
                    label={tag.replace('_', ' ')}
                    active={tagFilter === tag}
                    href={buildQueryHref({ tag, chain: chainFilter })}
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {chainOptions.map((option) => (
                <ChainChip
                  key={option}
                  label={option === 'ALL' ? 'All chains' : option.toUpperCase()}
                  active={
                    (!chainFilter && option === 'ALL') ||
                    (chainFilter && chainFilter.toLowerCase() === option.toLowerCase())
                  }
                  href={
                    option === 'ALL'
                      ? buildQueryHref({ tag: tagFilter })
                      : buildQueryHref({ tag: tagFilter, chain: option.toLowerCase() })
                  }
                />
              ))}
            </div>
          </div>
          <RecentBlocksTable blocks={filteredBlocks} />
        </section>
      </div>
    </main>
  );
}

function RecentBlocksTable({ blocks }: { blocks: StoredBlockSummary[] }) {
  if (blocks.length === 0) {
    return <p className="text-sm text-gray-500 py-6">No blocks found.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="py-2 pr-4">Block</th>
            <th className="py-2 pr-4">Signals</th>
            <th className="py-2 pr-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {blocks.map((block) => (
            <tr key={`${block.chain}-${block.height}`} className="align-top">
              <td className="py-4 pr-4">
                <p className="text-sm font-semibold text-gray-900">
                  {block.chain} · #{block.height}
                </p>
                <p className="text-xs text-gray-500">
                  {formatTimestamp(block.timestamp)} · {formatRelativeAge(block.timestamp)}
                </p>
              </td>
              <td className="py-4 pr-4">
                <div className="flex flex-wrap gap-2">
                  {block.tags.length === 0 && (
                    <span className="text-xs text-gray-500">No tags</span>
                  )}
                  {block.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 rounded-full border border-gray-300 text-xs uppercase tracking-wide text-gray-700"
                    >
                      {tag.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-4 pl-4">
                <div className="flex items-center justify-end gap-3">
                  <Link
                    href={`/blocks/${block.chain}/${block.height}`}
                    className="text-accent underline text-sm whitespace-nowrap"
                  >
                    View block
                  </Link>
                  <BlockPreview chain={block.chain} height={block.height} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilterChip({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1 rounded-full text-xs uppercase tracking-wide border transition ${
        active
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-gray-300 text-gray-500 hover:border-gray-400'
      }`}
    >
      {label}
    </Link>
  );
}

function ChainChip({ label, active, href }: { label: string; active: boolean; href: string }) {
  return (
    <Link
      href={href}
      className={`px-3 py-1 rounded-full text-xs uppercase tracking-wide border transition ${
        active
          ? 'border-gray-900 bg-gray-900 text-white'
          : 'border-gray-300 text-gray-600 hover:border-gray-400'
      }`}
    >
      {label}
    </Link>
  );
}

function formatTimestamp(ts: number) {
  const date = new Date(ts * 1000);
  return date.toLocaleString(undefined, {
    hour12: false,
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeAge(ts: number) {
  const now = Date.now();
  const diffSeconds = Math.round((now - ts * 1000) / 1000);
  const abs = Math.abs(diffSeconds);
  const suffix = diffSeconds >= 0 ? 'ago' : 'from now';
  if (abs < 60) return `${abs}s ${suffix}`;
  if (abs < 3600) return `${Math.round(abs / 60)}m ${suffix}`;
  if (abs < 86400) return `${Math.round(abs / 3600)}h ${suffix}`;
  return `${Math.round(abs / 86400)}d ${suffix}`;
}

function formatDensity(value: number) {
  if (!value || Number.isNaN(value)) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(0);
}

function TagSpotlightCard({ spotlight }: { spotlight: TagStats }) {
  const label = spotlight.tag.replace(/_/g, ' ');
  return (
    <div className="py-3 flex items-center justify-between">
      <div>
        <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
        <p className="text-base font-semibold text-gray-900">
          {spotlight.count}{' '}
          <span className="text-sm font-normal text-gray-500">
            {spotlight.count === 1 ? 'block' : 'blocks'}
          </span>
        </p>
      </div>
      {spotlight.latest ? (
        <Link
          href={`/blocks/${spotlight.latest.chain}/${spotlight.latest.height}`}
          className="text-accent underline text-sm"
        >
          View #{spotlight.latest.height}
        </Link>
      ) : (
        <span className="text-xs text-gray-500">No matches yet</span>
      )}
    </div>
  );
}

type AnalyticCard = {
  label: string;
  value: string | number;
  detail: string;
  suffix?: string;
};

function buildAnalyticsCards(
  summary: StoredBlockSummary,
  payload: any,
  hotzones: any[],
): AnalyticCard[] {
  const densities = hotzones.map((hz: any) => hz.density);
  const peakDensity =
    densities.length > 0 ? Math.max(...densities) : 0;
  const avgDensity =
    densities.length > 0
      ? densities.reduce((acc: number, value: number) => acc + value, 0) /
        densities.length
      : 0;
  const uniqueTags = new Set<string>(summary.tags ?? []);
  hotzones.forEach((hz: any) =>
    (hz.semanticTags ?? []).forEach((tag: string) => uniqueTags.add(tag)),
  );
  const foldedVectors = payload.foldedBlock?.foldedVectors ?? [];
  const vectorDim = foldedVectors[0]?.length ?? 0;
  const pqStats = payload.pqResidualStats ?? null;

  return [
    {
      label: 'Peak density',
      value: formatDensity(peakDensity),
      detail: 'Highest KDE hotzone intensity',
    },
    {
      label: 'Hotzones',
      value: hotzones.length,
      detail: `Avg density ${avgDensity.toFixed(2)}`,
    },
    {
      label: 'Semantic tags',
      value: uniqueTags.size,
      detail: [...uniqueTags].slice(0, 3).join(', ') || 'No tags detected',
    },
    {
      label: 'Folded vectors',
      value: foldedVectors.length,
      detail: vectorDim ? `${vectorDim} dims per vector` : 'Unknown dimension',
    },
    {
      label: 'Relative age',
      value: formatRelativeAge(summary.timestamp),
      detail: formatTimestamp(summary.timestamp),
    },
    {
      label: 'PQ residual p95',
      value: pqStats?.p95 != null ? Number(pqStats.p95).toFixed(3) : 'n/a',
      detail: pqStats
        ? `avg ${Number(pqStats.average ?? 0).toFixed(3)} · max ${Number(pqStats.max ?? 0).toFixed(3)}`
        : 'No PQ stats recorded',
    },
  ];
}

function buildQueryHref({
  tag,
  chain,
}: {
  tag?: string | null;
  chain?: string | null;
}) {
  const params = new URLSearchParams();
  if (tag && tag !== 'ALL') {
    params.set('tag', tag);
  }
  if (chain && chain !== 'ALL') {
    params.set('chain', chain);
  }
  const query = params.toString();
  const base = query ? `/?${query}` : '/';
  return `${base}#recent-blocks`;
}

