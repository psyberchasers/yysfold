'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { HEARTBEAT_EVENT, type HeartbeatEventPayload } from '@/lib/heartbeat';
import { getClientDataApiBase } from '@/lib/dataSource';

export function HeartbeatClient() {
  const router = useRouter();
  const digestRef = useRef<string | null>(null);

  useEffect(() => {
    const base = getClientDataApiBase();
    const heartbeatUrl = base ? `${base}/heartbeat` : '/api/heartbeat';
    const eventSource = new EventSource(heartbeatUrl);
    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as HeartbeatEventPayload;
        if (payload.digest && digestRef.current && payload.digest !== digestRef.current) {
          router.refresh();
        }
        if (payload.digest) {
          digestRef.current = payload.digest;
        }
        window.dispatchEvent(new CustomEvent(HEARTBEAT_EVENT, { detail: payload }));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[heartbeat] event parse failed', error);
      }
    };
    eventSource.onerror = (error) => {
      // eslint-disable-next-line no-console
      console.warn('[heartbeat] event source error', error);
      eventSource.close();
    };
    return () => {
      eventSource.close();
    };
  }, [router]);

  return null;
}

export default HeartbeatClient;

