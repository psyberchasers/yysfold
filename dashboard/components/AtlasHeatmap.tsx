import { Fragment } from 'react';
import type { AtlasNode } from '@/lib/atlas';

interface AtlasHeatmapProps {
  nodes: AtlasNode[];
  from: number;
  to: number;
  buckets?: number;
}

export function AtlasHeatmap({ nodes, from, to, buckets = 12 }: AtlasHeatmapProps) {
  const bucketSize = Math.max(1, Math.floor((to - from) / buckets));
  const bucketEdges = Array.from({ length: buckets }, (_, index) => from + index * bucketSize);
  const topNodes = nodes.slice(0, 10);
  const series = topNodes.map((node) => ({
    node,
    counts: bucketEdges.map((edge) => computeBucketValue(node, edge, edge + bucketSize)),
  }));
  const maxValue =
    series.length === 0
      ? 0
      : Math.max(
          ...series.flatMap((entry) => entry.counts),
        );

  if (series.length === 0 || maxValue === 0) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-gray-500">
        No timeslice data for the selected filters.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-[140px_auto] gap-2 text-xs text-gray-600 mb-2">
        <span className="text-[11px] uppercase tracking-wide text-gray-500">Clusters</span>
        <div className="flex justify-between">
          <span>{formatTick(bucketEdges[0])}</span>
          <span>{formatTick(from + (to - from) / 2)}</span>
          <span>{formatTick(to)}</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto border border-gray-200">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `140px repeat(${buckets}, minmax(0, 1fr))`,
          }}
        >
          {series.map((entry) => (
            <Fragment key={entry.node.id}>
              <div className="border-b border-gray-100 px-3 py-2 text-xs text-gray-600 flex flex-col gap-0.5">
                <span className="font-semibold text-gray-900">
                  #{entry.node.id}{' '}
                  <span className="text-gray-500 text-[11px]">
                    ({entry.node.tags.slice(0, 2).join(', ') || 'mixed'})
                  </span>
                </span>
                <span>{entry.node.count} samples</span>
              </div>
              {entry.counts.map((value, index) => (
                <div
                  key={`${entry.node.id}-${index}`}
                  className="border-b border-gray-100 border-l border-gray-100 h-12 flex items-center justify-center text-[11px] text-gray-700"
                  style={{
                    backgroundColor: colorScale(value, maxValue),
                  }}
                  title={`Cluster #${entry.node.id} · ${value} samples · ${formatTick(
                    bucketEdges[index],
                  )}`}
                >
                  {value > 0 ? abbreviate(value) : ''}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-2">
        <span>Low</span>
        <div className="flex-1 h-2 bg-gradient-to-r from-teal-50 via-teal-200 to-teal-500 rounded-full" />
        <span>High</span>
      </div>
    </div>
  );
}

function computeBucketValue(node: AtlasNode, startMs: number, endMs: number) {
  if (!node.timeslices || node.timeslices.length === 0) return 0;
  let total = 0;
  node.timeslices.forEach((slice) => {
    const sliceStart = slice.start * 1000;
    const sliceEnd = slice.end * 1000;
    if (sliceEnd < startMs || sliceStart > endMs) return;
    const overlapStart = Math.max(sliceStart, startMs);
    const overlapEnd = Math.min(sliceEnd, endMs);
    const overlapRatio = Math.max(0, overlapEnd - overlapStart) / Math.max(1, sliceEnd - sliceStart);
    total += slice.count * overlapRatio;
  });
  return Math.round(total);
}

function colorScale(value: number, maxValue: number) {
  if (maxValue <= 0 || value <= 0) return '#f0fdf4';
  const normalized = Math.min(1, value / maxValue);
  const alpha = 0.2 + normalized * 0.75;
  const green = 120 + normalized * 40;
  return `rgba(15, 118, 110, ${alpha})`.replace('110', `${green.toFixed(0)}`);
}

function formatTick(ms?: number) {
  if (!ms || Number.isNaN(ms)) return '';
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function abbreviate(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toString();
}


