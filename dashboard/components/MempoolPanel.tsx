'use client';

import { useEffect, useState } from 'react';
import type { MempoolSnapshot } from '@/lib/mempool';
import { HEARTBEAT_EVENT, type HeartbeatEventPayload } from '@/lib/heartbeat';

export function MempoolPanel({ initial }: { initial: MempoolSnapshot[] }) {
  const [snapshots, setSnapshots] = useState(initial);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<HeartbeatEventPayload>).detail;
      if (detail?.mempool) {
        setSnapshots(detail.mempool);
      }
    };
    window.addEventListener(HEARTBEAT_EVENT, handler as EventListener);
    return () => window.removeEventListener(HEARTBEAT_EVENT, handler as EventListener);
  }, []);

  if (snapshots.length === 0) {
    return (
      <article className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.3em] text-gray-500 mb-2">Mempool preview</p>
        <p className="text-sm text-gray-500">No pending transaction data yet.</p>
      </article>
    );
  }

  const view = snapshots
    .slice()
    .sort((a, b) => b.anomalyScore - a.anomalyScore || b.fetchedAt - a.fetchedAt)
    .slice(0, 3);

  return (
    <article className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Mempool preview</p>
          <h2 className="text-lg font-semibold text-gray-900">Pending block heat</h2>
        </div>
        <span className="text-xs text-gray-500 uppercase tracking-wide">
          {snapshots.length} chains
        </span>
      </div>
      <div className="flex flex-col gap-4">
        {view.map((snapshot) => {
          const pressure = clampScore(snapshot.anomalyScore);
          const pressureLabel = describePressure(pressure);
          return (
            <div
              key={`${snapshot.chain}-${snapshot.fetchedAt}`}
              className="flex flex-col gap-3 border border-gray-100 rounded-2xl p-4"
            >
              <div className="flex items-center justify-between text-sm text-gray-900">
                <div className="font-semibold uppercase">{snapshot.chain}</div>
                <div className="text-gray-500 text-xs" suppressHydrationWarning>
                  Est. #{snapshot.pseudoHeight} · {formatRelative(snapshot.fetchedAt)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-gray-900 transition-all"
                    style={{ width: `${Math.round(pressure * 100)}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-gray-800">{pressureLabel}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs text-gray-600">
                <div>
                  <p className="uppercase tracking-wide text-[10px] text-gray-400">Transactions</p>
                  <p className="text-lg font-semibold text-gray-900">{snapshot.txCount}</p>
                  <p className="text-[11px] text-gray-500">{deltaText(snapshot.deltaTx, 'tx')}</p>
                </div>
                <div>
                  <p className="uppercase tracking-wide text-[10px] text-gray-400">Avg gas</p>
                  <p className="text-lg font-semibold text-gray-900">{snapshot.avgGasPriceGwei} gwei</p>
                  <p className="text-[11px] text-gray-500">{deltaText(snapshot.deltaGas, 'gwei')}</p>
                </div>
                <div>
                  <p className="uppercase tracking-wide text-[10px] text-gray-400">Value</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {snapshot.totalValueEth.toFixed(2)} ETH
                  </p>
                  <p className="text-[11px] text-gray-500">{deltaText(snapshot.deltaValue, 'ETH')}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-gray-600">
                {(snapshot.highlights ?? ['Normal']).map((highlight) => (
                  <span key={highlight} className="px-2 py-1 rounded-full border border-gray-200">
                    {highlight}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function formatRelative(timestampSeconds: number) {
  const diffMs = Date.now() * 1 - timestampSeconds * 1000;
  if (diffMs < 1000) return 'just now';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

function clampScore(score: number | undefined) {
  if (!Number.isFinite(score)) return 0;
  return Math.min(Math.max(score ?? 0, 0), 1);
}

function describePressure(score: number) {
  if (score >= 0.75) return 'High pressure';
  if (score >= 0.4) return 'Moderate pressure';
  if (score > 0) return 'Low pressure';
  return 'Calm';
}

function deltaText(delta: number, suffix: string) {
  if (!delta) return 'flat';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)} ${suffix}/snapshot`;
}

export default MempoolPanel;

