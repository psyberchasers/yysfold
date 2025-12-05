"use client";

import { useMemo, useRef, useEffect, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';

interface HypergraphNode {
  id: string;
  density: number;
  semanticTags?: string[];
}

interface HypergraphEdge {
  nodes: number[];
  weight: number;
}

interface HypergraphView3DProps {
  nodes: HypergraphNode[];
  edges: HypergraphEdge[];
}

type GraphNode = {
  id: string;
  label: string;
  density: number;
  normalizedDensity: number;
  primaryTag: string;
  tags: string[];
  color: string;
};

type GraphLink = {
  source: string;
  target: string;
  weight: number;
  normalizedWeight: number;
};

const sphereGeometry = new THREE.SphereGeometry(4, 24, 24);

export default function HypergraphView3D({ nodes, edges }: HypergraphView3DProps) {
  const graphRef = useRef(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 420 });
  const graphData = useMemo(() => buildGraphData(nodes, edges), [nodes, edges]);

  useEffect(() => {
    const graph = graphRef.current as { zoomToFit?: (ms: number, px: number) => void } | null;
    graph?.zoomToFit?.(400, 80);
  }, [graphData]);

  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth && clientHeight) {
        setDimensions({ width: clientWidth, height: clientHeight });
      }
    };
    updateSize();
    if (!containerRef.current) return;
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (graphData.nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">
        No hypergraph data for this block.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden">
      <ForceGraph3D
        ref={graphRef as unknown as React.MutableRefObject<undefined>}
        graphData={graphData}
        width={Math.max(dimensions.width, 300)}
        height={Math.max(dimensions.height, 240)}
        backgroundColor="#ffffff"
        nodeAutoColorBy="primaryTag"
        nodeVal={(node: GraphNode) => 6 + node.normalizedDensity * 24}
        nodeLabel={(node: GraphNode) =>
          `${node.label}\nDensity: ${node.density.toLocaleString()}\nTags: ${
            node.tags.length > 0 ? node.tags.join(', ') : '—'
          }`
        }
        nodeThreeObject={(node: GraphNode) => buildNodeObject(node)}
        nodeThreeObjectExtend
        linkWidth={(link: GraphLink) => 0.3 + link.normalizedWeight * 2.5}
        linkOpacity={0.6}
        linkColor={(link: GraphLink) => {
          const opacity = 0.5 + link.normalizedWeight * 0.4;
          return `rgba(99,102,241,${Math.min(opacity, 0.9)})`;
        }}
        enableNodeDrag={false}
        warmupTicks={40}
        cooldownTicks={120}
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.35}
      />
    </div>
  );
}

function buildGraphData(nodes: HypergraphNode[], edges: HypergraphEdge[]) {
  if (!nodes || nodes.length === 0) return { nodes: [] as GraphNode[], links: [] as GraphLink[] };
  const densities = nodes.map((node) => node.density ?? 0);
  const minDensity = densities.reduce((acc, value) => Math.min(acc, value), Number.POSITIVE_INFINITY);
  const maxDensity = densities.reduce((acc, value) => Math.max(acc, value), 0.0001);
  const densitySpan = Math.max(maxDensity - minDensity, 1e-9);
  const maxWeight = edges.reduce((acc, edge) => Math.max(acc, edge.weight ?? 0), 0.0001);

  const graphNodes: GraphNode[] = nodes.map((node, index) => {
    const normalizedDensity = normalizeDensity(node.density ?? 0, minDensity, densitySpan);
    return {
      id: node.id ?? `hz-${index}`,
      label: node.id ?? `Hotzone ${index + 1}`,
      density: node.density ?? 0,
      normalizedDensity,
      primaryTag: node.semanticTags?.[0] ?? 'OTHER',
      tags: node.semanticTags ?? [],
      color: resolveNodeColor(node, normalizedDensity),
    };
  });

  const links: GraphLink[] = [];
  edges.forEach((edge) => {
    const nodeIndexes = edge.nodes.filter((idx) => typeof idx === 'number' && graphNodes[idx]);
    for (let i = 0; i < nodeIndexes.length; i += 1) {
      for (let j = i + 1; j < nodeIndexes.length; j += 1) {
        links.push({
          source: graphNodes[nodeIndexes[i]].id,
          target: graphNodes[nodeIndexes[j]].id,
          weight: edge.weight ?? 1,
          normalizedWeight: Math.max((edge.weight ?? 1) / maxWeight, 0),
        });
      }
    }
  });

  return { nodes: graphNodes, links };
}

function buildNodeObject(node: GraphNode) {
  const color = new THREE.Color(node.color);
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color.clone().multiplyScalar(0.35),
    transparent: true,
    opacity: 0.9,
  });
  const mesh = new THREE.Mesh(sphereGeometry, material);
  const scale = 0.6 + node.normalizedDensity * 2.2;
  mesh.scale.set(scale, scale, scale);
  mesh.userData = { label: node.label };
  return mesh;
}

function normalizeDensity(value: number, min: number, span: number) {
  const clamped = Math.min(Math.max((value - min) / span, 0), 1);
  return Math.pow(clamped, 0.65);
}

function resolveNodeColor(node: HypergraphNode, normalizedDensity: number) {
  const tags = (node.semanticTags ?? []).map((tag) => tag.toUpperCase());
  if (tags.some((tag) => tag.includes('AML'))) return '#f87171';
  if (tags.some((tag) => tag.includes('LENDING'))) return '#0ea5e9';
  if (tags.some((tag) => tag.includes('DEX') || tag.includes('MEV'))) return '#10b981';
  if (tags.some((tag) => tag.includes('NFT'))) return '#fbbf24';
  if (tags.some((tag) => tag.includes('HIGH_FEE'))) return '#ef4444';
  if (tags.some((tag) => tag.includes('BRIDGE'))) return '#a855f7';
  if (tags.some((tag) => tag.includes('HIGH_VALUE'))) return '#fb7185';
  if (tags.some((tag) => tag.includes('TIME_CLUSTER'))) return '#38bdf8';
  return densityGradient(normalizedDensity);
}

function densityGradient(normalizedDensity: number) {
  const color = new THREE.Color();
  color.setHSL(0.62 - normalizedDensity * 0.25, 0.65, 0.55);
  return `#${color.getHexString()}`;
}

