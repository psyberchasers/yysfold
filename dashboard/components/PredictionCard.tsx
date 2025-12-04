'use client';

import { useEffect, useState } from 'react';
import type { PredictionSignal } from '@/lib/predictions';
import { HEARTBEAT_EVENT, type HeartbeatEventPayload } from '@/lib/heartbeat';

interface PredictionCardProps {
  chain: string;
  initial?: PredictionSignal | null;
}

export default function PredictionCard({ chain, initial }: PredictionCardProps) {
  const [prediction, setPrediction] = useState<PredictionSignal | null>(initial ?? null);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<HeartbeatEventPayload>).detail;
      if (detail?.predictions) {
        const next = detail.predictions.find((p) => p.chain === chain) ?? detail.predictions[0] ?? null;
        if (next) {
          setPrediction(next);
        }
      }
    };
    window.addEventListener(HEARTBEAT_EVENT, handler as EventListener);
    return () => window.removeEventListener(HEARTBEAT_EVENT, handler as EventListener);
  }, [chain]);

  return (
    <article className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Predicted next block</p>
          <h2 className="text-lg font-semibold text-gray-900">{chain.toUpperCase()}</h2>
        </div>
        {prediction && (
          <span className="text-sm font-semibold text-gray-900">
            {(prediction.confidence * 100).toFixed(0)}% confidence
          </span>
        )}
      </div>
      {prediction ? (
        <>
          <div className="flex flex-wrap gap-2">
            {prediction.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 rounded-full border border-gray-300 text-xs uppercase tracking-wide text-gray-700"
              >
                {tag.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
          <p className="text-sm text-gray-600">
            ETA ~{prediction.etaSeconds}s · {new Date(prediction.generatedAt * 1000).toLocaleTimeString()}
          </p>
          <ul className="text-xs text-gray-500 list-disc pl-5">
            {prediction.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-gray-500">Waiting for live signal…</p>
      )}
    </article>
  );
}










