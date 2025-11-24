'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { CopyableText } from './CopyableText';
import { getChainMetadata } from '@/lib/chains';

interface BlockPreviewProps {
  chain: string;
  height: number;
}

interface BlockApiResponse {
  chain: string;
  height: number;
  tags: string[];
  summary: {
    hotzones?: any[];
    hypergraph?: any;
  };
  rawBlock?: {
    transactions?: Record<string, unknown>[];
    executionTraces?: Record<string, unknown>[];
  };
}

export function BlockPreview({ chain, height }: BlockPreviewProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BlockApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const chainMeta = getChainMetadata(chain);

  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    fetch(`/api/blocks/${chain}/${height}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(await res.text());
        }
        return res.json();
      })
      .then((payload) => {
        setData(payload);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load block');
      })
      .finally(() => setLoading(false));
  }, [open, data, chain, height]);

  return (
    <div className="text-xs relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center px-3 py-1 border border-gray-300 text-gray-700 text-xs font-medium uppercase tracking-wide hover:border-gray-500 transition bg-white whitespace-nowrap"
      >
        {open ? 'Hide details' : 'Quick view'}
      </button>
      {open && (
        <div className="mt-3 p-4 border border-gray-300 rounded-none bg-white w-[min(500px,90vw)] shadow-sm">
          {loading && <p className="text-gray-500">Loading…</p>}
          {error && <p className="text-red-500">{error}</p>}
          {!loading && data && (
            <>
              <div className="flex flex-col gap-1 mb-3">
                <p className="text-sm font-mono text-gray-900">
                  {chain} · #{height}
                </p>
                <p className="text-xs text-gray-500">
                  Tags: {data.tags && data.tags.length > 0 ? data.tags.join(', ') : 'None'}
                </p>
              </div>
              <TransactionPreview
                transactions={data.rawBlock?.transactions ?? []}
                chainSymbol={chainMeta.symbol}
                minUnit={chainMeta.minUnit}
                decimals={chainMeta.decimals}
              />
              <Link
                href={`/blocks/${chain}/${height}`}
                className="text-accent underline text-xs mt-3 inline-block"
              >
                Open full block →
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TransactionPreview({
  transactions,
  chainSymbol,
  minUnit,
  decimals,
}: {
  transactions: Record<string, unknown>[];
  chainSymbol: string;
  minUnit: string;
  decimals: number;
}) {
  if (transactions.length === 0) {
    return <p className="text-xs text-gray-500">No transaction data.</p>;
  }
  const slice = transactions.slice(0, 5);
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        Showing {slice.length} of {transactions.length} transactions
      </p>
      <div className="max-h-48 overflow-auto border border-gray-200 rounded-none">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-left bg-gray-50 text-gray-500">
              <th className="px-2 py-1">Hash</th>
              <th className="px-2 py-1">Amount</th>
              <th className="px-2 py-1">Sender</th>
              <th className="px-2 py-1">Receiver</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((tx, index) => (
              <tr key={index} className="border-t border-gray-100">
                <td className="px-2 py-1 font-mono text-[10px] text-gray-900">
                  <CopyableText
                    value={String(tx.hash ?? '')}
                    label="transaction hash"
                    truncateAt={12}
                    className="text-[10px]"
                  />
                </td>
                <td className="px-2 py-1 text-gray-900">
                  {formatNativeAmount(tx, chainSymbol, minUnit, decimals)}
                </td>
                <td className="px-2 py-1 text-gray-600">{String(tx.sender ?? '—')}</td>
                <td className="px-2 py-1 text-gray-600">{String(tx.receiver ?? '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatNativeAmount(
  tx: Record<string, unknown>,
  symbol: string,
  minUnit: string,
  decimals: number,
) {
  const base =
    typeof tx.amountWei === 'number'
      ? tx.amountWei
      : typeof tx.amount === 'number'
        ? tx.amount
        : Number(tx.amountWei ?? 0);
  const native =
    typeof tx.amountEth === 'number'
      ? tx.amountEth
      : Number.isFinite(base)
        ? base / 10 ** decimals
        : 0;
  if (!Number.isFinite(native)) return `0 ${symbol}`;
  const baseDisplay = Number.isFinite(base) ? Math.round(base) : 0;
  return `${native.toFixed(6)} ${symbol} (${baseDisplay} ${minUnit})`;
}


