'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from 'recharts';

interface HistogramBin {
  start: number;
  end: number;
  count: number;
}

interface HistogramResponse {
  bins: HistogramBin[];
  stats: {
    average: number;
    max: number;
    p95: number;
    count: number;
  };
  totalCount: number;
  threshold: number;
  range: {
    from: number;
    to: number;
  };
}

const RANGE_OPTIONS = [
  { label: '6h', value: 6 },
  { label: '24h', value: 24 },
  { label: '72h', value: 72 },
];

const CHAIN_OPTIONS = [
  { label: 'All chains', value: 'all' },
  { label: 'Ethereum', value: 'eth' },
  { label: 'Avalanche', value: 'avax' },
];

export function PQResidualHistogram() {
  const [hours, setHours] = useState(24);
  const [chain, setChain] = useState('all');
  const [data, setData] = useState<HistogramResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          hours: hours.toString(),
          buckets: '24',
        });
        if (chain !== 'all') {
          params.set('chain', chain);
        }
        const response = await fetch(`/api/metrics/pq?${params.toString()}`, { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error(`Failed to fetch histogram (status ${response.status})`);
        }
        const json = (await response.json()) as HistogramResponse;
        if (!cancelled) {
          setData(json);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load PQ histogram');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [hours, chain]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.bins.map((bin) => ({
      midpoint: (bin.start + bin.end) / 2,
      label: `${formatResidual(bin.start)}–${formatResidual(bin.end)}`,
      count: bin.count,
      start: bin.start,
      end: bin.end,
    }));
  }, [data]);

  return (
    <article className="bg-white rounded-3xl border border-gray-200 p-6 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gray-500">PQ fidelity</p>
          <h2 className="text-lg font-semibold text-gray-900">Residual distribution</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>Range</span>
          <div className="flex rounded border border-gray-200 overflow-hidden">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setHours(option.value)}
                className={`px-3 py-1 transition ${
                  hours === option.value
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <select
            className="border border-gray-200 rounded px-2 py-1 text-gray-700 bg-white"
            value={chain}
            onChange={(event) => setChain(event.target.value)}
          >
            {CHAIN_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="h-64">
        {loading ? (
          <div className="h-full w-full animate-pulse bg-gray-100" />
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" />
              <XAxis
                type="number"
                dataKey="midpoint"
                tickFormatter={(value) => formatResidual(value as number)}
                stroke="#9ca3af"
                fontSize={12}
              />
              <YAxis allowDecimals={false} stroke="#9ca3af" fontSize={12} />
              <Tooltip
                formatter={(value, _, entry) => [
                  value,
                  `${formatResidual((entry.payload as any).start)} – ${formatResidual(
                    (entry.payload as any).end,
                  )}`,
                ]}
                labelFormatter={() => 'Residual bucket'}
                contentStyle={{ borderRadius: 8 }}
              />
              <ReferenceLine
                x={data?.threshold ?? 0.25}
                stroke="#f97316"
                strokeDasharray="4 4"
                label={{
                  value: `bound ${formatResidual(data?.threshold ?? 0.25)}`,
                  position: 'insideTopRight',
                  fill: '#f97316',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="count" fill="#0f172a" opacity={0.8} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full flex items-center justify-center text-sm text-gray-500">
            No residual samples in this range
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm">
        <ResidualStat label="Average" value={formatResidual(data?.stats.average ?? 0)} />
        <ResidualStat label="95th pct" value={formatResidual(data?.stats.p95 ?? 0)} />
        <ResidualStat label="Max" value={formatResidual(data?.stats.max ?? 0)} />
      </div>
      <div className="text-xs text-gray-500">
        {data?.totalCount ?? 0} samples between{' '}
        {data ? formatRangeWindow(data.range.from, data.range.to) : '—'}
      </div>
    </article>
  );
}

function ResidualStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-[0.3em] text-gray-500">{label}</span>
      <span className="text-lg font-semibold text-gray-900">{value}</span>
    </div>
  );
}

function formatResidual(value: number) {
  if (!Number.isFinite(value)) return '0.00';
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function formatRangeWindow(from: number, to: number) {
  const durationHours = Math.max(0, to - from) / 3600;
  if (durationHours >= 24) {
    return `${(durationHours / 24).toFixed(0)} days`;
  }
  return `${durationHours.toFixed(0)} hours`;
}

export default PQResidualHistogram;

