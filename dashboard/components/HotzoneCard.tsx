import clsx from 'clsx';

interface HotzoneCardProps {
  zone: {
    id: string;
    density: number;
    radius: number;
    semanticTags?: string[];
    center?: number[];
  };
  maxDensity: number;
  totalDensity: number;
  order: number;
  chainLabel?: string;
}

export function HotzoneCard({ zone, maxDensity, totalDensity, order, chainLabel }: HotzoneCardProps) {
  const normalizedShare =
    totalDensity > 0 ? Math.max(0, Math.min(zone.density / totalDensity, 1)) : 0;
  const densityPercentile =
    maxDensity > 0 ? Math.round((zone.density / maxDensity) * 100) : 0;
  const topComponents = (zone.center ?? [])
    .map((value, index) => ({ value, index }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 4);

  return (
    <div className="border border-gray-200 rounded-none p-4 bg-white flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
        <span>
          Hotzone {order + 1}
          {chainLabel ? ` · ${chainLabel}` : ''}
        </span>
        <span className="font-mono text-gray-900">{zone.id}</span>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="text-xs text-gray-500 uppercase">Density</p>
            <p className="text-xl font-semibold text-accent">{zone.density.toFixed(2)}</p>
            <p className="text-[11px] text-gray-500">≈ P{densityPercentile}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Block mass</p>
            <p className="text-lg font-semibold text-gray-900">
              {(normalizedShare * 100).toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase">Radius</p>
            <p className="text-lg font-semibold text-gray-900">
              {zone.radius?.toFixed(2) ?? '—'}
            </p>
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase mb-2">Dominant components</p>
          <div className="flex flex-wrap gap-2">
            {topComponents.length === 0 && (
              <span className="text-gray-500 text-xs">No center vector</span>
            )}
            {topComponents.map((component) => (
              <span
                key={component.index}
                className="text-xs font-mono bg-gray-100 px-2 py-1 rounded-full text-gray-900"
              >
                c{component.index}:{' '}
                {component.value >= 0 ? '+' : ''}
                {component.value.toFixed(3)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {(zone.semanticTags ?? []).length === 0 && (
          <span className="text-xs text-gray-500">No semantic tags</span>
        )}
        {(zone.semanticTags ?? []).map((tag) => (
          <span
            key={tag}
            className={clsx(
              'text-[11px] uppercase tracking-wide px-3 py-1 rounded-full border',
              'border-gray-300 bg-gray-100 text-accent',
            )}
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

