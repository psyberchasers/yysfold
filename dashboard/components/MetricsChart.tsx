'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  Line,
} from 'recharts';

type IntervalOption = 'hour' | 'day';
type RangeOption = '7d' | '30d' | '90d';

interface TimeseriesPoint {
  timestamp: number;
  blockCount: number;
  avgPeakDensity: number;
  avgDexGasShare: number;
  avgLendingVolumeWei: number;
  tagCounts: Record<string, number>;
}

interface TimeseriesResponse {
  points: TimeseriesPoint[];
  tags: string[];
  metadata?: {
    chains?: string[];
  };
  summary?: {
    peakBlock?: { timestamp: number; value: number };
    tagPeaks?: Record<string, { timestamp: number; value: number }>;
  };
}

const RANGE_TO_MS: Record<RangeOption, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

const DEFAULT_TAGS = ['AML_ALERT', 'DEX_ACTIVITY', 'LENDING_ACTIVITY', 'HIGH_FEE'];

const TAG_COLORS: Record<string, string> = {
  AML_ALERT: '#f87171',
  DEX_ACTIVITY: '#10b981',
  NFT_ACTIVITY: '#6366f1',
  LENDING_ACTIVITY: '#f59e0b',
  HIGH_FEE: '#ef4444',
  BRIDGE_ACTIVITY: '#8b5cf6',
};

export function MetricsChart() {
  const [interval, setInterval] = useState<IntervalOption>('day');
  const [range, setRange] = useState<RangeOption>('30d');
  const [selectedTags, setSelectedTags] = useState<string[]>(DEFAULT_TAGS);
  const [availableTags, setAvailableTags] = useState<string[]>(DEFAULT_TAGS);
  const [chain, setChain] = useState<string>('all');
  const [availableChains, setAvailableChains] = useState<string[]>([]);
  const [data, setData] = useState<TimeseriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({
    blocks: true,
    density: true,
    dexGas: true,
    lending: false,
  });

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const to = Date.now();
        const from = to - RANGE_TO_MS[range];
        const params = new URLSearchParams({
          interval,
          from: String(from),
          to: String(to),
        });
        if (chain !== 'all') {
          params.set('chains', chain);
        }
        if (selectedTags.length > 0) {
          params.set('tags', selectedTags.join(','));
        }
        const response = await fetch(`/api/metrics/timeseries?${params.toString()}`);
        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }
        const payload = (await response.json()) as TimeseriesResponse;
        setData(payload);
        if (payload.tags && payload.tags.length > 0) {
          setAvailableTags(payload.tags);
          setSelectedTags((prev) => {
            const filtered = prev.filter((tag) => payload.tags.includes(tag));
            if (filtered.length > 0) return filtered;
            return payload.tags.slice(0, Math.min(4, payload.tags.length));
          });
        }
        setAvailableChains(payload.metadata?.chains ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load metrics');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [interval, range, chain, selectedTags]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.points.map((point) => {
      const base: Record<string, number | string> = {
        timestamp: point.timestamp,
        label: new Date(point.timestamp).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: interval === 'hour' ? '2-digit' : undefined,
        }),
        blockCount: point.blockCount,
        avgPeakDensity: point.avgPeakDensity,
        avgDexGasPct: point.avgDexGasShare * 100,
        avgLendingVolume: point.avgLendingVolumeWei / 1e18,
      };
      selectedTags.forEach((tag) => {
        base[tag] = point.tagCounts[tag] ?? 0;
      });
      return base;
    });
  }, [data, interval, selectedTags]);

  const summaryCards = useMemo(() => {
    if (!data?.summary) return [];
    const cards = [];
    if (data.summary.peakBlock) {
      cards.push({
        label: 'Peak block bucket',
        value: data.summary.peakBlock.value.toLocaleString(),
        detail: formatFullTime(data.summary.peakBlock.timestamp),
      });
    }
    selectedTags.slice(0, 2).forEach((tag) => {
      const peak = data.summary?.tagPeaks?.[tag];
      if (peak) {
        cards.push({
          label: `${formatTag(tag)} spike`,
          value: peak.value.toLocaleString(),
          detail: formatFullTime(peak.timestamp),
        });
      }
    });
    return cards;
  }, [data?.summary, selectedTags]);

  const handleToggleTag = useCallback(
    (tag: string) => {
      setSelectedTags((prev) => {
        if (prev.includes(tag)) {
          return prev.length === 1 ? prev : prev.filter((entry) => entry !== tag);
        }
        const next = [...prev, tag];
        return next.slice(-5);
      });
    },
    [setSelectedTags],
  );

  const handleToggleMetric = (key: keyof typeof metrics) => {
    setMetrics((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const downloadCsv = () => {
    if (!data) return;
    const headers = [
      'timestamp',
      'blockCount',
      'avgPeakDensity',
      'avgDexGasShare',
      'avgLendingVolumeWei',
      ...selectedTags,
    ];
    const rows = data.points.map((point) => [
      new Date(point.timestamp).toISOString(),
      point.blockCount,
      point.avgPeakDensity.toFixed(2),
      point.avgDexGasShare.toFixed(4),
      point.avgLendingVolumeWei.toFixed(2),
      ...selectedTags.map((tag) => point.tagCounts[tag] ?? 0),
    ]);
    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'atlas-telemetry.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Atlas telemetry</p>
          <h2 className="text-lg font-semibold text-gray-900">Cross-chain activity</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(['7d', '30d', '90d'] as RangeOption[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              className={`px-3 py-1 rounded-full border ${
                option === range ? 'border-accent text-accent' : 'border-gray-300 text-gray-600'
              }`}
            >
              {option.toUpperCase()}
            </button>
          ))}
          <div className="w-px h-6 bg-gray-200 mx-1" />
          {(['hour', 'day'] as IntervalOption[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setInterval(option)}
              className={`px-3 py-1 rounded-full border ${
                option === interval ? 'border-accent text-accent' : 'border-gray-300 text-gray-600'
              }`}
            >
              {option === 'hour' ? 'Hourly' : 'Daily'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <label className="text-xs uppercase tracking-wide text-gray-500">
          Chain
          <select
            value={chain}
            onChange={(event) => setChain(event.target.value)}
            className="ml-2 border border-gray-300 rounded-full px-3 py-1 text-sm"
          >
            <option value="all">All chains</option>
            {availableChains.map((option) => (
              <option key={option} value={option}>
                {option.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          {availableTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => handleToggleTag(tag)}
              className={`px-3 py-1 rounded-full border text-xs uppercase tracking-wide ${
                selectedTags.includes(tag)
                  ? 'border-accent text-accent'
                  : 'border-gray-300 text-gray-500'
              }`}
            >
              {formatTag(tag)}
            </button>
          ))}
        </div>
      </div>

      {summaryCards.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
          {summaryCards.map((card) => (
            <div key={card.label} className="border border-gray-200 rounded-2xl px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.3em] text-gray-500">{card.label}</p>
              <p className="text-2xl font-semibold text-gray-900">{card.value}</p>
              <p className="text-xs text-gray-500">{card.detail}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
        {[
          { key: 'blocks', label: 'Blocks' },
          { key: 'density', label: 'Peak density' },
          { key: 'dexGas', label: 'DEX gas %' },
          { key: 'lending', label: 'Lending volume' },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => handleToggleMetric(item.key as keyof typeof metrics)}
            className={`px-3 py-1 rounded-full border ${
              metrics[item.key as keyof typeof metrics]
                ? 'border-gray-900 text-gray-900'
                : 'border-gray-300 text-gray-500'
            }`}
          >
            {item.label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={downloadCsv}
          className="px-3 py-1 border border-gray-300 rounded-full text-xs text-gray-600 hover:border-gray-400"
        >
          Download CSV
        </button>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading && !data && <p className="text-sm text-gray-500">Loading metrics…</p>}
      {!loading && chartData.length === 0 && (
        <p className="text-sm text-gray-500">No telemetry recorded for this range.</p>
      )}
      {chartData.length > 0 && (
        <div className="h-[420px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip content={<TelemetryTooltip tags={selectedTags} />} />
              <Legend />
              {metrics.blocks && (
                <Area
                  yAxisId="left"
                  type="monotone"
                  dataKey="blockCount"
                  name="Blocks"
                  stroke="#6366f1"
                  fill="#c7d2fe"
                  fillOpacity={0.6}
                />
              )}
              {metrics.density && (
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="avgPeakDensity"
                  name="Peak density"
                  stroke="#0f172a"
                  strokeWidth={2}
                  dot={false}
                />
              )}
              {metrics.dexGas && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avgDexGasPct"
                  name="DEX gas %"
                  stroke="#14b8a6"
                  strokeWidth={2}
                  dot={false}
                />
              )}
              {metrics.lending && (
                <Bar
                  yAxisId="left"
                  dataKey="avgLendingVolume"
                  name="Lending volume (native)"
                  fill="#fde68a"
                />
              )}
              {selectedTags.map((tag) => (
                <Line
                  key={tag}
                  yAxisId="left"
                  type="monotone"
                  dataKey={tag}
                  name={formatTag(tag)}
                  stroke={TAG_COLORS[tag] ?? '#6b7280'}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
              <Brush dataKey="label" height={24} stroke="#9ca3af" travellerWidth={12} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function TelemetryTooltip({
  active,
  payload,
  label,
  tags,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  tags: string[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const ctx = payload[0].payload;
  return (
    <div className="bg-white text-gray-900 text-xs p-3 border border-gray-200 rounded-md shadow">
      <p className="font-semibold text-sm mb-1">{label}</p>
      <p>Blocks: {ctx.blockCount?.toLocaleString()}</p>
      <p>Peak density: {ctx.avgPeakDensity?.toFixed(2)}</p>
      <p>DEX gas %: {ctx.avgDexGasPct?.toFixed(1)}%</p>
      <p>Lending volume: {ctx.avgLendingVolume?.toFixed(2)} native</p>
      {tags.map((tag) => (
        <p key={tag}>
          {formatTag(tag)}: {ctx[tag]?.toLocaleString?.() ?? ctx[tag]}
        </p>
      ))}
    </div>
  );
}

function formatTag(tag: string) {
  return tag
    .split('_')
    .map((chunk) => chunk.charAt(0) + chunk.slice(1).toLowerCase())
    .join(' ');
}

function formatFullTime(timestamp?: number) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

