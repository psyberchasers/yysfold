"use client";

import { useMemo } from 'react';

interface HypergraphNode {
  id: string;
  density: number;
  semanticTags?: string[];
}

interface HypergraphEdge {
  nodes: number[];
  weight: number;
}

interface HypergraphViewProps {
  nodes: HypergraphNode[];
  edges: HypergraphEdge[];
}

export function HypergraphView({ nodes, edges }: HypergraphViewProps) {
  const layout = useMemo(() => positionNodes(nodes), [nodes]);
  const maxWeight = edges.reduce(
    (acc, edge) => Math.max(acc, edge.weight ?? 0),
    0.0001,
  );

  return (
    <div className="bg-white rounded-none border border-gray-200 p-4">
      <div className="relative w-full h-[320px]">
        <svg viewBox="0 0 400 320" className="w-full h-full">
          {edges.map((edge, index) => {
            const nodePositions = edge.nodes
              .map((idx) => layout[idx])
              .filter(Boolean);
            if (nodePositions.length < 2) return null;
            const strokeOpacity = Math.max(edge.weight / maxWeight, 0.1);
            const pathD = buildEdgePath(nodePositions);
            return (
              <path
                key={`edge-${index}`}
                d={pathD}
                fill="none"
                stroke="url(#edgeGradient)"
                strokeWidth={2 + 4 * strokeOpacity}
                opacity={0.35 + strokeOpacity * 0.5}
              />
            );
          })}
          {layout.map((node, index) => {
            const fill = nodeColor(node);
            return (
              <g key={node.id}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={12 + node.size * 10}
                  fill={fill}
                  fillOpacity={0.8}
                />
                <text
                  x={node.x}
                  y={node.y - 18 - node.size * 8}
                  textAnchor="middle"
                  className="text-[10px] fill-gray-800"
                >
                  {node.id}
                </text>
              </g>
            );
          })}
          <defs>
            <linearGradient id="edgeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8a5cf6" />
              <stop offset="100%" stopColor="#f365f3" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Nodes sized by density. Edge thickness encodes shared activity within each
        hyperedge (weight normalized).
      </p>
    </div>
  );
}

function positionNodes(nodes: HypergraphNode[]) {
  const centerX = 200;
  const centerY = 150;
  const radius = 100;
  const maxDensity = nodes.reduce(
    (acc, node) => Math.max(acc, node.density ?? 0),
    0.0001,
  );
  return nodes.map((node, index) => {
    const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2;
    return {
      ...node,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      size: Math.max(node.density / maxDensity, 0.2),
    };
  });
}

function buildEdgePath(points: { x: number; y: number }[]) {
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;
  }
  const [first, ...rest] = points;
  return rest.reduce((path, point) => `${path} L${point.x},${point.y}`, `M${first.x},${first.y}`) + ' Z';
}

function nodeColor(node: HypergraphNode) {
  const tags = node.semanticTags ?? [];
  if (tags.some((tag) => tag.includes('NFT'))) return '#f39c12';
  if (tags.some((tag) => tag.includes('DEX'))) return '#1abc9c';
  if (tags.some((tag) => tag.includes('HIGH_FEE'))) return '#e74c3c';
  return '#8a5cf6';
}

