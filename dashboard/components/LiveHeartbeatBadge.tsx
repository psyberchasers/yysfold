'use client';

import { useEffect, useState } from 'react';
import { HEARTBEAT_EVENT, type HeartbeatEventPayload } from '@/lib/heartbeat';

interface HeartbeatState {
  chain: string | null;
  height: number | null;
  timestamp: number | null;
  serverTime: number | null;
}

export default function LiveHeartbeatBadge() {
  const [state, setState] = useState<HeartbeatState>({
    chain: null,
    height: null,
    timestamp: null,
    serverTime: null,
  });
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<HeartbeatEventPayload>).detail;
      if (!detail) return;
      setConnected(true);
      setState({
        chain: detail.chain,
        height: detail.height,
        timestamp: detail.timestamp,
        serverTime: detail.serverTime ?? null,
      });
    };
    window.addEventListener(HEARTBEAT_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(HEARTBEAT_EVENT, handler as EventListener);
    };
  }, []);

  const relative =
    state.serverTime != null ? formatRelative(state.serverTime) : connected ? 'just now' : 'offline';

  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-gray-500">
      <span
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-semibold ${
          connected ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`} />
        Live
      </span>
      <span className="normal-case text-gray-600" suppressHydrationWarning>
        Updated {relative}
        {state.chain ? ` · ${state.chain} #${state.height ?? '—'}` : ''}
      </span>
    </div>
  );
}

function formatRelative(timestampSeconds: number) {
  if (!timestampSeconds) return 'just now';
  const diffMs = Date.now() - timestampSeconds * 1000;
  if (diffMs < 1000) return 'just now';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

