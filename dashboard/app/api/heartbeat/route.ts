import { NextRequest } from 'next/server';
import { getHeartbeatURL } from '@/lib/api';

export const dynamic = 'force-dynamic';
export const runtime = 'edge'; // Use edge runtime for streaming

export async function GET(_request: NextRequest) {
  // Proxy to Render backend
  const backendUrl = getHeartbeatURL();
  
  try {
    const backendResponse = await fetch(backendUrl, {
      headers: {
        'Accept': 'text/event-stream',
      },
    });

    if (!backendResponse.ok || !backendResponse.body) {
      return new Response(
        `data: ${JSON.stringify({ status: 'error', message: 'Backend unavailable' })}\n\n`,
        {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
          },
        }
      );
    }

    // Stream the response from backend
    return new Response(backendResponse.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[heartbeat] Proxy error:', error);
    return new Response(
      `data: ${JSON.stringify({ status: 'error', message: 'Connection failed' })}\n\n`,
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}
