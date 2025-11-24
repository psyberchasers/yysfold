import { Fragment } from 'react';

interface BlockHeatmapProps {
  hotzones: Array<{
    id?: string;
    density?: number;
    radius?: number;
    semanticTags?: string[];
  }>;
  tags?: string[];
}

const DEFAULT_TAGS = ['DEX_ACTIVITY', 'NFT_ACTIVITY', 'LENDING_ACTIVITY', 'BRIDGE_ACTIVITY', 'HIGH_FEE'];

export function BlockHeatmap({ hotzones, tags = DEFAULT_TAGS }: BlockHeatmapProps) {
  if (!hotzones || hotzones.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-gray-500 h-full">
        No hotzones detected for this block.
      </div>
    );
  }

  const densityMax = Math.max(...hotzones.map((zone) => Number(zone.density ?? 0)));
  const radiusMax = Math.max(...hotzones.map((zone) => Number(zone.radius ?? 0.0001)));

  const rows = [
    {
      key: 'density',
      label: 'Density',
      description: 'Relative KDE intensity',
      values: hotzones.map((zone) => Number(zone.density ?? 0)),
      max: densityMax || 1,
      isBinary: false,
    },
    {
      key: 'radius',
      label: 'Radius',
      description: 'KDE bandwidth',
      values: hotzones.map((zone) => Number(zone.radius ?? 0)),
      max: radiusMax || 1,
      isBinary: false,
    },
    ...tags.map((tag) => ({
      key: tag,
      label: toFriendlyTag(tag),
      description: `${tag.replace('_', ' ')} presence`,
      values: hotzones.map((zone) =>
        zone.semanticTags?.some((entry) => entry.toUpperCase() === tag.toUpperCase()) ? 1 : 0,
      ),
      max: 1,
      isBinary: true,
    })),
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-[120px_auto] gap-2 text-[11px] uppercase tracking-wide text-gray-500 mb-2">
        <span>Metric</span>
        <div className="flex justify-between text-gray-400">
          <span>Zone 1</span>
          <span>…</span>
          <span>Zone {hotzones.length}</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto border border-gray-200">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `120px repeat(${hotzones.length}, minmax(0, 1fr))`,
          }}
        >
          {rows.map((row) => (
            <Fragment key={row.key}>
              <div className="border-b border-gray-100 px-3 py-2 flex flex-col gap-0.5 text-xs text-gray-600 bg-gray-50">
                <span className="font-semibold text-gray-900">{row.label}</span>
                <span className="text-[10px] text-gray-500">{row.description}</span>
              </div>
              {row.values.map((value, columnIndex) => (
                <div
                  key={`${row.key}-${columnIndex}`}
                  className="border-b border-l border-gray-100 h-12 flex items-center justify-center text-[11px] text-gray-800"
                  style={{
                    backgroundColor: row.isBinary
                      ? value > 0
                        ? 'rgba(56, 189, 248, 0.45)'
                        : 'transparent'
                      : makeGradient(value, row.max),
                  }}
                  title={`${row.label} · Zone ${columnIndex + 1} · ${formatNumber(value)}`}
                >
                  {row.isBinary ? (value > 0 ? 'yes' : '') : formatNumber(value)}
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-2">
        <span>Low</span>
        <div className="flex-1 h-2 bg-gradient-to-r from-gray-100 via-emerald-200 to-emerald-500 rounded-full" />
        <span>High</span>
      </div>
    </div>
  );
}

function makeGradient(value: number, max: number) {
  if (max <= 0 || value <= 0) return 'transparent';
  const ratio = Math.min(1, value / max);
  const alpha = 0.2 + ratio * 0.7;
  return `rgba(16, 185, 129, ${alpha})`;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

function toFriendlyTag(tag: string) {
  return tag
    .split('_')
    .map((chunk) => chunk.charAt(0) + chunk.slice(1).toLowerCase())
    .join(' ');
}

