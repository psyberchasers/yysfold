'use client';

import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

interface BlockProjectionProps {
  hotzones: Array<{ id?: string; center?: number[]; semanticTags?: string[]; density?: number }>;
}

export function BlockProjection({ hotzones }: BlockProjectionProps) {
  if (!hotzones || hotzones.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-500">
        No hotzone coordinates available.
      </div>
    );
  }
  const points = hotzones.map((zone, index) => ({
    x: zone.center?.[0] ?? 0,
    y: zone.center?.[1] ?? 0,
    tag: zone.semanticTags?.[0] ?? 'MIXED_ACTIVITY',
    density: Number(zone.density ?? 0).toFixed(2),
    id: zone.id ?? `zone-${index}`,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis type="number" dataKey="x" name="PCA1" tick={{ fontSize: 12 }} />
        <YAxis type="number" dataKey="y" name="PCA2" tick={{ fontSize: 12 }} />
        <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<ProjectionTooltip />} />
        <Scatter
          name="Hotzones"
          data={points}
          fill="#14b8a6"
          shape="circle"
          line={{ stroke: '#14b8a6', strokeWidth: 1 }}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function ProjectionTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload;
  return (
    <div className="bg-white text-gray-900 text-xs p-2 border border-gray-200 rounded shadow">
      <p className="font-semibold">{point.id}</p>
      <p>Tag: {point.tag}</p>
      <p>Density: {point.density}</p>
      <p>PCA1: {point.x.toFixed(3)}</p>
      <p>PCA2: {point.y.toFixed(3)}</p>
    </div>
  );
}

