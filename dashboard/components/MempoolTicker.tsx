'use client';

import { useEffect, useState } from 'react';
import type { MempoolSnapshot } from '@/lib/mempool';
import { HEARTBEAT_EVENT, type HeartbeatEventPayload } from '@/lib/heartbeat';

export function MempoolTicker({ initial }: { initial: MempoolSnapshot[] }) {
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

  if (snapshots.length === 0) return null;
  const feed = snapshots
    .slice()
    .sort((a, b) => b.anomalyScore - a.anomalyScore || b.fetchedAt - a.fetchedAt)
    .slice(0, 4);

  return (
    <div className="w-full rounded-3xl border border-emerald-100 bg-emerald-50/70 px-5 py-4 shadow-inner">
      <p className="mb-3 text-[11px] uppercase tracking-[0.3em] text-emerald-700">Incoming activity</p>
      <div className="divide-y divide-emerald-100 border border-emerald-100 rounded-2xl bg-white">
        {feed.map((snap) => {
          const pressure = clampScore(snap.anomalyScore);
          const pressureLabel = describePressure(pressure);
          return (
            <div
              key={`${snap.chain}-${snap.fetchedAt}`}
              className="px-4 py-3 text-sm text-emerald-900 flex flex-col gap-1"
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold uppercase">{snap.chain}</div>
                <span className="text-xs text-emerald-700" suppressHydrationWarning>{formatRelative(snap.fetchedAt)}</span>
              </div>
              <p className="text-xs text-emerald-800">
                {pressureLabel} · {snap.txCount} tx · {snap.avgGasPriceGwei} gwei ·{' '}
                {snap.totalValueEth.toFixed(1)} ETH · Δtx {formatDelta(snap.deltaTx)} · Δgas{' '}
                {formatDelta(snap.deltaGas)} gwei
              </p>
              <p className="text-xs text-emerald-700 italic">
                {(snap.highlights ?? ['Normal']).join(' · ')}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatRelative(timestampSeconds: number) {
  const diffMs = Date.now() - timestampSeconds * 1000;
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

function formatDelta(delta: number) {
  if (!delta) return '0';
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}`;
}

export default MempoolTicker;

