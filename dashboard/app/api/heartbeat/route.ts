import { NextRequest } from 'next/server';
import { getLatestBlockSummary } from '@/lib/blocks';
import { readLatestMempoolSnapshots } from '@/lib/mempool';
import { readLatestPredictions } from '@/lib/predictions';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = () => {
        const latest = getLatestBlockSummary();
        const digest = latest
          ? `${latest.chain}-${latest.height}-${latest.blockHash}`
          : null;
        const payload = JSON.stringify({
          status: latest ? 'ok' : 'empty',
          digest,
          chain: latest?.chain ?? null,
          height: latest?.height ?? null,
          timestamp: latest?.timestamp ?? null,
          serverTime: Math.floor(Date.now() / 1000),
          mempool: readLatestMempoolSnapshots(),
          predictions: readLatestPredictions(),
        });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      };

      send();
      const interval = setInterval(send, 5000);

      return () => {
        clearInterval(interval);
        controller.close();
      };
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-store',
    },
  });
}

