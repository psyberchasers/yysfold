import Link from 'next/link';
import { readFileSync } from 'node:fs';
import {
  getLatestBlockSummary,
  listRecentBlockSummaries,
  getTagStats,
  StoredBlockSummary,
  TagStats,
} from '@/lib/blocks';
import { HotzoneCard } from '../components/HotzoneCard';
import { HypergraphView } from '../components/HypergraphView';
import { ProofPanel } from '../components/ProofPanel';
import { SemanticSearch } from '../components/SemanticSearch';
import { BlockPreview } from '../components/BlockPreview';
import { buildArtifactUrl } from '@/lib/artifacts';
import { CopyableText } from '../components/CopyableText';

interface PageProps {
  searchParams?: { tag?: string };
}

const spotlightTags = ['NFT_ACTIVITY', 'DEX_ACTIVITY', 'HIGH_FEE', 'LARGE_VALUE', 'LENDING_ACTIVITY'];

async function loadDashboardData(tagFilter?: string) {
  const summary = getLatestBlockSummary();
  if (!summary) {
    return { summary: null, payload: null, recent: [], spotlights: [] };
  }
  const payload = JSON.parse(readFileSync(summary.summaryPath, 'utf-8'));
  const recent = listRecentBlockSummaries(12, tagFilter);
  const spotlights = spotlightTags.map((tag) => getTagStats(tag));
  return { summary, payload, recent, spotlights };
}

export default async function Page({ searchParams }: PageProps) {
  const tagFilter = searchParams?.tag;
  const data = await loadDashboardData(tagFilter);

  if (!data.summary || !data.payload) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-canvas text-gray-300">
        <p>No blocks ingested yet. Run `npm run ingest` to populate data.</p>
      </main>
    );
  }

  const { summary, payload, recent, spotlights } = data;
  const hotzones = payload.hotzones ?? [];
  const hypergraph = payload.hypergraph ?? { nodes: [], hyperedges: [] };
  const tagFilters = ['NFT_ACTIVITY', 'DEX_ACTIVITY', 'HIGH_FEE', 'LARGE_VALUE'];
  const analyticCards = buildAnalyticsCards(summary, payload, hotzones);

  return (
    <main className="min-h-screen bg-white text-gray-900 px-6 py-8">
      <header className="max-w-6xl mx-auto flex flex-col gap-2 mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
          Block Behavioral Dashboard
        </h1>
        <p className="text-gray-600">
          Chain: <span className="font-mono text-gray-900">{summary.chain}</span> · Height:{' '}
          <span className="font-mono text-gray-900">{summary.height}</span> · Tags:{' '}
          {summary.tags.length > 0 ? summary.tags.join(', ') : '−'}
        </p>
        <div className="flex gap-4 text-sm text-gray-600 flex-wrap items-center">
          <span className="flex items-center gap-2">
            Commitment:{' '}
            <CopyableText
              value={summary.blockHash}
              label="block hash"
              truncateAt={14}
              className="text-gray-900"
            />
          </span>
          <span>
            Proof:{' '}
            <a className="text-accent underline" href={buildArtifactUrl(summary.proofPath)}>
              download proof
            </a>
          </span>
          <Link
            href="/chat"
            className="ml-auto px-3 py-1 border border-gray-300 text-xs uppercase tracking-wide rounded-full hover:border-gray-500"
          >
            Open AI chat
          </Link>
        </div>
      </header>

      <section className="max-w-6xl mx-auto grid gap-4 md:grid-cols-3 mb-8">
        {analyticCards.map((card) => (
          <article
            key={card.label}
            className="bg-white rounded-none border border-gray-200 p-5"
          >
            <p className="text-xs uppercase tracking-wide text-gray-500">
              {card.label}
            </p>
            <p className="text-3xl font-semibold text-gray-900 mt-2">
              {card.value}
              {card.suffix ?? ''}
            </p>
            <p className="text-sm text-gray-500 mt-1">{card.detail}</p>
          </article>
        ))}
      </section>

      <section className="max-w-6xl mx-auto grid gap-4 md:grid-cols-3 mb-8">
        {spotlights.map((spotlight) => (
          <TagSpotlightCard key={spotlight.tag} spotlight={spotlight} />
        ))}
      </section>

      <section className="max-w-6xl mx-auto mb-8">
        <ProofPanel
          chain={summary.chain}
          height={summary.height}
          blockHash={summary.blockHash}
          commitments={payload.commitments ?? {}}
          codebookRoot={payload.codebookRoot}
          proofHex={payload.proofHex}
        />
      </section>

      <section className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-3">
        <article className="bg-white rounded-none p-6 border border-gray-200 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Hotzone Atlas</h2>
              <p className="text-sm text-gray-500">
                KDE density clusters (top {Math.min(hotzones.length, 6)})
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
                maxDensity={
                  hotzones.length > 0
                    ? Math.max(...hotzones.map((h: any) => h.density))
                    : 1
                }
              />
            ))}
          </div>
        </article>

        <article className="bg-white rounded-none p-6 border border-gray-200 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Hypergraph View</h2>
              <p className="text-sm text-gray-500">
                {hypergraph.nodes?.length ?? 0} nodes ·{' '}
                {hypergraph.hyperedges?.length ?? 0} hyperedges
              </p>
            </div>
            <a className="text-accent underline text-sm" href={buildArtifactUrl(summary.hotzonesPath)}>
              Download JSON
            </a>
          </div>
          <HypergraphView
            nodes={hypergraph.nodes ?? []}
            edges={hypergraph.hyperedges ?? []}
          />
        </article>
      </section>

      <section className="max-w-6xl mx-auto mt-8">
        <article className="bg-white rounded-none border border-gray-200 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Recent Blocks</h2>
              <p className="text-sm text-gray-500">
                Live timeline of ingested summaries ({recent.length} shown)
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterChip label="All" active={!tagFilter} href="/" />
              {tagFilters.map((tag) => (
                <FilterChip
                  key={tag}
                  label={tag.replace('_', ' ')}
                  active={tagFilter === tag}
                  href={`/?tag=${encodeURIComponent(tag)}`}
                />
              ))}
            </div>
          </div>
          <div className="divide-y divide-gray-200">
            {recent.length === 0 && (
              <p className="text-sm text-gray-500 py-6">No blocks found.</p>
            )}
            {recent.map((block) => (
              <TimelineRow key={`${block.chain}-${block.height}`} block={block} />
            ))}
          </div>
        </article>
      </section>

      <section className="max-w-6xl mx-auto mt-8 mb-16">
        <article className="bg-white rounded-none border border-gray-200 p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Semantic Query</h2>
            <p className="text-sm text-gray-500">
              Search by tag, block hash, chain, or height.
            </p>
          </div>
          <SemanticSearch />
        </article>
      </section>
    </main>
  );
}

function TimelineRow({ block }: { block: StoredBlockSummary }) {
  const formattedTime = formatTimestamp(block.timestamp);
  return (
    <div className="py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-mono text-gray-900">
          {block.chain} · #{block.height}
        </p>
        <p className="text-xs text-gray-500">{formattedTime}</p>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {block.tags.length === 0 && (
          <span className="text-gray-500">No tags</span>
        )}
        {block.tags.map((tag) => (
          <span
            key={tag}
            className="px-2 py-1 rounded-full border border-gray-300 text-accent"
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="flex gap-3 items-center">
        <Link
          href={`/blocks/${block.chain}/${block.height}`}
          className="text-accent underline text-sm"
        >
          View block →
        </Link>
        <BlockPreview chain={block.chain} height={block.height} />
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string;
}) {
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

function TagSpotlightCard({ spotlight }: { spotlight: TagStats }) {
  const label = spotlight.tag.replace(/_/g, ' ');
  return (
    <article className="bg-white rounded-none border border-gray-200 p-5 flex flex-col gap-3">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-3xl font-semibold text-gray-900">{spotlight.count}</p>
      <p className="text-sm text-gray-500">
        {spotlight.count === 1 ? 'block' : 'blocks'} tagged
      </p>
      {spotlight.latest ? (
        <Link
          href={`/blocks/${spotlight.latest.chain}/${spotlight.latest.height}`}
          className="text-accent underline text-sm"
        >
          View latest #{spotlight.latest.height}
        </Link>
      ) : (
        <span className="text-xs text-gray-600">No matches yet</span>
      )}
    </article>
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
) : AnalyticCard[] {
  const densities = hotzones.map((hz: any) => hz.density);
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

  return [
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
  ];
}

