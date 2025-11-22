import { notFound } from 'next/navigation';
import Link from 'next/link';
import { readFileSync } from 'node:fs';
import { getBlockSummary } from '@/lib/blocks';
import { HotzoneCard } from '@/components/HotzoneCard';
import { HypergraphView } from '@/components/HypergraphView';
import { ProofPanel } from '@/components/ProofPanel';
import { findLendingTransactions } from '@/lib/tagEvidence';
import type { LendingTransactionEvidence } from '@/lib/tagEvidence';
import { CopyableText } from '@/components/CopyableText';
import { buildArtifactUrl } from '@/lib/artifacts';

interface PageProps {
  params: { chain: string; height: string };
}

export default async function BlockDetailPage({ params }: PageProps) {
  const height = Number(params.height);
  if (!Number.isFinite(height)) {
    notFound();
  }
  const record = getBlockSummary(params.chain, height);
  if (!record) {
    notFound();
  }
  const payload = JSON.parse(readFileSync(record.summaryPath, 'utf-8'));
  const rawBlock = JSON.parse(readFileSync(record.blockPath, 'utf-8'));
  const hotzones = payload.hotzones ?? [];
  const hypergraph = payload.hypergraph ?? { nodes: [], hyperedges: [] };
  const foldedVectors = payload.foldedBlock?.foldedVectors ?? [];
  const pqCode = payload.pqCode;
  const metadata = payload.foldedBlock?.metadata ?? {};
  const transactions = rawBlock.transactions ?? [];
  const executionTraces = rawBlock.executionTraces ?? [];
  const lendingTransactions = findLendingTransactions(record.blockPath, 20);

  return (
    <main className="min-h-screen bg-white text-gray-900 px-6 py-10">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col gap-4">
          <Link href="/" className="text-sm text-gray-500 hover:text-accent">
            ← Back to overview
          </Link>
          <div>
            <p className="text-sm uppercase tracking-wide text-gray-500">
              Block detail
            </p>
            <h1 className="text-3xl font-semibold text-gray-900">
              {record.chain} · #{record.height}
            </h1>
            <p className="text-gray-500">
              {formatTimestamp(record.timestamp)} ·{' '}
              {record.tags.length > 0 ? record.tags.join(', ') : 'Unlabeled'}
            </p>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <DetailCard
            label="Block hash"
            value={record.blockHash}
            detail="Latest folded commitment"
            copyValue
          />
          <DetailCard
            label="Transactions"
            value={metadata.txCount ?? foldedVectors.length}
            detail={`${foldedVectors.length} folded vectors`}
          />
          <DetailCard
            label="Hotzones"
            value={hotzones.length}
            detail={`Avg density ${averageDensity(hotzones).toFixed(2)}`}
          />
        </section>

        <ProofPanel
          chain={record.chain}
          height={record.height}
          blockHash={record.blockHash}
          commitments={payload.commitments ?? {}}
          codebookRoot={payload.codebookRoot}
          proofHex={payload.proofHex}
        />

        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Hotzone Atlas</h2>
              <p className="text-sm text-gray-500">
                KDE density clusters for this block
              </p>
            </div>
            <span className="text-xs uppercase tracking-wide text-gray-500">
              {hotzones.length} zones
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {hotzones.map((zone: any, index: number) => (
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
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <article className="bg-white rounded-none border border-gray-200 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Hypergraph</h2>
                <p className="text-sm text-gray-500">
                  {hypergraph.nodes?.length ?? 0} nodes ·{' '}
                  {hypergraph.hyperedges?.length ?? 0} hyperedges
                </p>
              </div>
              <a className="text-sm text-accent underline" href={buildArtifactUrl(record.hotzonesPath)}>
                Download
              </a>
            </div>
            <HypergraphView
              nodes={hypergraph.nodes ?? []}
              edges={hypergraph.hyperedges ?? []}
            />
          </article>

          <article className="bg-white rounded-none border border-gray-200 p-6 flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-gray-900">Folded vectors</h2>
            <p className="text-sm text-gray-500">
              Showing the first 5 folded vectors (dimension{' '}
              {foldedVectors[0]?.length ?? 0})
            </p>
            <div className="space-y-3">
              {foldedVectors.slice(0, 5).map((vector: number[], index: number) => (
                <div
                  key={`vector-${index}`}
                  className="border border-gray-200 rounded-none p-3 bg-white"
                >
                  <div className="text-xs text-gray-500 mb-1">
                    Vector {index + 1}
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px] font-mono text-accent">
                    {vector.slice(0, 10).map((value, component) => (
                      <span key={component}>
                        c{component}:{value >= 0 ? '+' : ''}
                        {value.toFixed(3)}
                      </span>
                    ))}
                    {vector.length > 10 && <span>…</span>}
                  </div>
                </div>
              ))}
            </div>
            <a className="text-sm text-accent underline" href={buildArtifactUrl(record.summaryPath)}>
              Download full summary JSON
            </a>
          </article>
        </section>

        <section className="bg-white rounded-none border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">PQ encoding</h2>
          {pqCode ? (
            <div className="space-y-2 text-sm text-gray-600">
              <p>
                Subvectors: {pqCode.indices.length} · Indices per vector:{' '}
                {pqCode.indices[0]?.length ?? 0}
              </p>
              <p>
                Codebook root:{' '}
                <span className="font-mono text-gray-900">
                  {payload.codebookRoot ?? 'N/A'}
                </span>
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">PQ code missing.</p>
          )}
        </section>

        {lendingTransactions.length > 0 && (
          <section className="bg-white rounded-none border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Lending triggers</h2>
                <p className="text-sm text-gray-500">
                  {lendingTransactions.length} transaction
                  {lendingTransactions.length === 1 ? '' : 's'} matched the lending address list.
                </p>
              </div>
            </div>
            <LendingTransactionsTable transactions={lendingTransactions} />
          </section>
        )}

        <section className="bg-white rounded-none border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Transactions</h2>
              <p className="text-sm text-gray-500">
                Showing up to 50 of {transactions.length} transactions
              </p>
            </div>
            <a className="text-sm text-accent underline" href={buildArtifactUrl(record.blockPath)}>
              Download raw block
            </a>
          </div>
          <TransactionTable transactions={transactions.slice(0, 50)} />
          <p className="text-xs text-gray-500 mt-4">
            Execution traces recorded: {executionTraces.length}
          </p>
        </section>
      </div>
    </main>
  );
}

function DetailCard({
  label,
  value,
  detail,
  copyValue,
}: {
  label: string;
  value: string | number;
  detail?: string;
  copyValue?: boolean;
}) {
  return (
    <article className="bg-white rounded-none border border-gray-200 p-5">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      {copyValue ? (
        <CopyableText value={String(value)} label={label} truncateAt={20} className="text-2xl" />
      ) : (
        <p className="text-2xl font-semibold text-gray-900 mt-2">{value}</p>
      )}
      {detail && <p className="text-sm text-gray-500 mt-1">{detail}</p>}
    </article>
  );
}

function averageDensity(hotzones: any[]) {
  if (hotzones.length === 0) return 0;
  const sum = hotzones.reduce(
    (acc: number, zone: any) => acc + Number(zone.density ?? 0),
    0,
  );
  return sum / hotzones.length;
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

function TransactionTable({ transactions }: { transactions: Record<string, unknown>[] }) {
  if (transactions.length === 0) {
    return <p className="text-sm text-gray-500">No transactions were captured for this block.</p>;
  }
  return (
    <div className="overflow-auto border border-gray-200 rounded-none">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-600 uppercase text-xs">
            <th className="px-3 py-2 text-left">Hash</th>
            <th className="px-3 py-2 text-left">Amount</th>
            <th className="px-3 py-2 text-left">Sender</th>
            <th className="px-3 py-2 text-left">Receiver</th>
            <th className="px-3 py-2 text-left">Fee</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx, index) => (
            <tr key={index} className="border-t border-gray-100">
              <td className="px-3 py-2 font-mono text-xs text-gray-900">
                <CopyableText value={String(tx.hash ?? '')} label="transaction hash" truncateAt={18} />
              </td>
              <td className="px-3 py-2 text-gray-900">{formatEthDisplay(tx)}</td>
              <td className="px-3 py-2 text-gray-600">{String(tx.sender ?? '—')}</td>
              <td className="px-3 py-2 text-gray-600">{String(tx.receiver ?? '—')}</td>
              <td className="px-3 py-2 text-gray-600">{formatNumber(Number(tx.fee ?? 0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

function formatEthDisplay(tx: Record<string, unknown>) {
  const eth = typeof tx.amountEth === 'number' ? tx.amountEth : Number(tx.amount ?? 0) / 1e18;
  const wei = typeof tx.amountWei === 'number' ? tx.amountWei : Number(tx.amount ?? 0);
  if (!Number.isFinite(eth)) return '0 ETH';
  return `${eth.toFixed(6)} ETH (${wei} wei)`;
}

function LendingTransactionsTable({
  transactions,
}: {
  transactions: LendingTransactionEvidence[];
}) {
  return (
    <div className="overflow-auto border border-gray-200 rounded-none">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-gray-600 uppercase text-xs">
            <th className="px-3 py-2 text-left">Hash</th>
            <th className="px-3 py-2 text-left">Protocol</th>
            <th className="px-3 py-2 text-left">Amount (ETH)</th>
            <th className="px-3 py-2 text-left">Selector</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => (
            <tr key={tx.hash} className="border-t border-gray-100">
              <td className="px-3 py-2 font-mono text-xs text-gray-900">
                <CopyableText value={tx.hash} label="transaction hash" truncateAt={18} />
              </td>
              <td className="px-3 py-2 text-gray-700">{tx.protocol}</td>
              <td className="px-3 py-2 text-gray-900">{formatEthDisplay(tx)}</td>
              <td className="px-3 py-2 text-gray-600">{tx.functionSelector ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

