'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useMemo, useState } from 'react';
import * as THREE from 'three';

type HotzoneLike = {
  id?: string;
  center?: number[];
  density?: number;
  semanticTags?: string[];
};

type ColorMode = 'tag' | 'density';

interface LatentExplorerProps {
  hotzones: HotzoneLike[];
}

interface ProcessedNode {
  id: string;
  position: [number, number, number];
  density: number;
  normalizedDensity: number;
  primaryTag: string;
  colorByTag: string;
  colorByDensity: string;
}

export function LatentExplorer({ hotzones }: LatentExplorerProps) {
  const [colorMode, setColorMode] = useState<ColorMode>('tag');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const nodes = useMemo(() => processHotzones(hotzones), [hotzones]);
  const selectedNode = selectedIndex !== null ? nodes[selectedIndex] : null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
        <span>Latent explorer (now-cast)</span>
        <div className="flex gap-2">
          {(['tag', 'density'] as ColorMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setColorMode(mode)}
              className={`px-3 py-1 border text-[10px] ${
                colorMode === mode
                  ? 'border-gray-900 bg-gray-900 text-white'
                  : 'border-gray-300 text-gray-700'
              }`}
            >
              {mode === 'tag' ? 'Color · Tags' : 'Color · Density'}
            </button>
          ))}
        </div>
      </div>
      <div className="relative mt-3 flex-1 border border-gray-200 bg-[#050509]">
        {nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            No latent vectors available.
          </div>
        ) : (
          <Canvas
            camera={{ position: [0, 0, 4], fov: 55, near: 0.1, far: 100 }}
            dpr={[1, 1.5]}
          >
            <color attach="background" args={['#050509']} />
            <ambientLight intensity={0.7} />
            <pointLight position={[6, 8, 4]} intensity={1.2} />
            <pointLight position={[-6, -4, -5]} intensity={0.3} color="#4ade80" />
            <gridHelper args={[10, 10, '#1f2937', '#111827']} />
            {nodes.map((node, index) => (
              <mesh
                key={node.id}
                position={node.position}
                scale={calcScale(node.normalizedDensity, selectedIndex === index)}
                onPointerOver={(event) => {
                  event.stopPropagation();
                  setSelectedIndex(index);
                }}
                onPointerOut={(event) => {
                  event.stopPropagation();
                  setSelectedIndex(null);
                }}
              >
                <boxGeometry args={[0.35, 0.35, 0.35]} />
                <meshStandardMaterial
                  color={colorMode === 'tag' ? node.colorByTag : node.colorByDensity}
                  emissive={new THREE.Color(colorMode === 'tag' ? node.colorByTag : node.colorByDensity)}
                  emissiveIntensity={selectedIndex === index ? 0.4 : 0.12}
                  roughness={0.25}
                  metalness={0.15}
                />
              </mesh>
            ))}
            <OrbitControls makeDefault enablePan enableZoom enableRotate />
          </Canvas>
        )}
        {selectedNode && (
          <div className="pointer-events-none absolute left-3 top-3 max-w-xs rounded border border-gray-700 bg-black/80 p-3 text-xs text-gray-100 backdrop-blur">
            <p className="text-sm font-semibold text-white">{selectedNode.id}</p>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">
              Tag · {selectedNode.primaryTag.replace(/_/g, ' ')}
            </p>
            <p>Density: {selectedNode.density.toFixed(4)}</p>
            <p>
              Position:{' '}
              {selectedNode.position.map((axis) => axis.toFixed(3)).join(', ')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function processHotzones(hotzones: HotzoneLike[]): ProcessedNode[] {
  if (!hotzones || hotzones.length === 0) return [];
  const densities = hotzones.map((zone) => Number(zone.density ?? 0));
  const minDensity = Math.min(...densities);
  const maxDensity = Math.max(...densities);
  const span = Math.max(maxDensity - minDensity, 1e-6);

  return hotzones.map((zone, index) => {
    const position: [number, number, number] = [
      Number(zone.center?.[0] ?? 0),
      Number(zone.center?.[1] ?? 0),
      Number(zone.center?.[2] ?? 0),
    ];
    const density = Number(zone.density ?? 0);
    const normalizedDensity = Math.min(Math.max((density - minDensity) / span, 0), 1);
    const primaryTag = (zone.semanticTags?.[0] ?? 'MIXED_ACTIVITY').toUpperCase();
    return {
      id: zone.id ?? `hotzone-${index}`,
      position,
      density,
      normalizedDensity,
      primaryTag,
      colorByTag: colorForTag(primaryTag, normalizedDensity),
      colorByDensity: densityGradient(normalizedDensity),
    };
  });
}

function colorForTag(tag: string, normalizedDensity: number) {
  const palette: Record<string, string> = {
    AML_ALERT: '#f87171',
    DEX_ACTIVITY: '#34d399',
    NFT_ACTIVITY: '#fbbf24',
    LENDING_ACTIVITY: '#38bdf8',
    HIGH_FEE: '#ef4444',
    BRIDGE_ACTIVITY: '#a855f7',
    MEV_ACTIVITY: '#fb7185',
    MIXED_ACTIVITY: '#cbd5f5',
    HIGH_VALUE: '#fde047',
    VOLATILITY_CRUSH: '#f472b6',
    TIME_CLUSTER: '#0ea5e9',
  };
  if (palette[tag]) return palette[tag];
  return densityGradient(normalizedDensity);
}

function densityGradient(value: number) {
  const color = new THREE.Color();
  // Blend from teal → violet as density increases.
  color.setHSL(0.55 - value * 0.3, 0.65, 0.55);
  return `#${color.getHexString()}`;
}

function calcScale(value: number, isActive: boolean) {
  const base = 0.4 + value * 1.5;
  return isActive ? base * 1.25 : base;
}

export default LatentExplorer;

