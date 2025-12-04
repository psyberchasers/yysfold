import { readFileSync } from 'node:fs';
import { NextResponse } from 'next/server';
import { searchBlocksByTag, listRecentBlockSummaries } from '@/lib/blocks';
import type { StoredBlockSummary } from '@/lib/blocks';
import { dedupeBlocks, inferTags } from '@/lib/askUtils';
import { findLendingTransactions } from '@/lib/tagEvidence';
import { filterAtlas, loadAtlasGraph } from '@/lib/atlas';
import { summarizeBehaviorRegime } from '@/lib/regime';
import { computeAnomalyScore } from '@/lib/anomaly';
import type { BehaviorMetrics } from '../../../../shared/behavior';

interface ChatRequest {
  question?: string;
  source?: string;
  limit?: number;
}

const HF_ENDPOINT = 'https://router.huggingface.co/v1/chat/completions';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as ChatRequest;
  const question = body.question?.trim();
  if (!question) {
    return NextResponse.json({ error: 'Missing question' }, { status: 400 });
  }
  const hfToken = process.env.HF_TOKEN;
  if (!hfToken) {
    return NextResponse.json(
      { error: 'HF_TOKEN env var not set. Provide a Hugging Face access token.' },
      { status: 500 },
    );
  }
  const model = process.env.HF_MODEL ?? 'moonshotai/Kimi-K2-Instruct:nebius';
  const inferredSource = inferSource(question);
  const source = body.source?.trim() || inferredSource;
  const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(body.limit ?? 10, 20)) : 10;

  const inferredTags = inferTags(question);
  let matches: StoredBlockSummary[] = dedupeBlocks(
    inferredTags.flatMap((tag) => searchBlocksByTag(tag, source, limit)),
    limit,
  );
  if (matches.length === 0 && inferredTags.length > 0) {
    const widened = dedupeBlocks(
      inferredTags.flatMap((tag) => searchBlocksByTag(tag, source, limit * 5)),
      limit,
    );
    if (widened.length > 0) {
      matches = widened;
    }
  }
  const notes: string[] = [];
  if (matches.length === 0) {
    const fallback = listRecentBlockSummaries(limit).filter((block) =>
      source ? block.chain === source : true,
    );
    if (fallback.length > 0) {
      matches = fallback;
      notes.push('No direct tag matches found; showing the most recent fingerprints instead.');
    }
  }
  const includeRecentWindow = referencesRecentWindow(question);
  let recentContext = '';
  if (includeRecentWindow) {
    const recentBlocks = listRecentBlockSummaries(200).filter((block) => {
      const withinHour = block.timestamp >= Math.floor(Date.now() / 1000) - 3600;
      const matchesSource = source ? block.chain === source : true;
      return withinHour && matchesSource;
    });
    if (recentBlocks.length > 0) {
      matches = dedupeBlocks(
        [...recentBlocks, ...matches],
        Math.max(limit, recentBlocks.length),
      );
      recentContext = summarizeRecentWindow(recentBlocks, inferredTags);
    } else {
      recentContext = 'No blocks ingested within the last hour for the requested scope.';
      notes.push(recentContext);
    }
  }
  const requestedChains = source ? [source] : inferChainsFromQuestion(question);
  if (
    requestedChains.length > 0 &&
    matches.length > 0 &&
    requestedChains.every((chain) => !matches.some((block) => block.chain === chain))
  ) {
    notes.push(`Requested chain(s) ${requestedChains.join(', ')} have no ingested blocks yet.`);
  }

  const atlasInsights = buildAtlasInsights(question, inferredTags);

  const context = buildContext(matches);
  const prompt = composePrompt(question, inferredTags, context, recentContext, atlasInsights);
  const references = matches.map((block) => buildReference(block));
  const primaryReference = references[0] ?? null;

  const response = await fetch(HF_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${hfToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'You are an analyst. Use the provided block summaries (folded fingerprints) to answer questions. Reference block chain + height when citing evidence.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    return NextResponse.json(
      { error: 'HF router error', details: errText.slice(0, 500) },
      { status: 500 },
    );
  }
  const completion = (await response.json()) as any;
  const answer =
    completion?.choices?.[0]?.message?.content ??
    'No response generated. Please try rephrasing the question.';

  return NextResponse.json({
    question,
    source: source ?? null,
    inferredTags,
    answer,
    primaryReference,
    references,
    atlasReferences: atlasInsights,
    notes,
  });
}

function buildReference(block: StoredBlockSummary) {
  const relativeAge = describeRelativeAge(block.timestamp);
  const insights = readSummaryInsights(block.summaryPath);
  const lendingTransactions = block.tags.includes('LENDING_ACTIVITY')
    ? findLendingTransactions(block.blockPath, 5)
    : [];
  return {
    chain: block.chain,
    height: block.height,
    tags: block.tags.slice(0, 10),
    summaryPath: block.summaryPath,
    hotzonesPath: block.hotzonesPath,
    timestamp: block.timestamp,
    relativeAge,
    peakHotzoneDensity: insights?.peakHotzoneDensity ?? null,
    hotzoneCount: insights?.hotzoneCount ?? null,
    behaviorMetrics: insights?.behavior ?? null,
    anomaly: insights?.anomaly ?? null,
    behaviorRegime: insights?.behaviorRegime ?? null,
    lendingTransactions,
  };
}

function readSummaryInsights(summaryPath: string):
  | {
      peakHotzoneDensity: number;
      hotzoneCount: number;
      behavior: BehaviorMetrics | null;
      behaviorRegime: string | null;
      anomaly: ReturnType<typeof computeAnomalyScore> | null;
    }
  | null {
  try {
    const raw = readFileSync(summaryPath, 'utf-8');
    const summary = JSON.parse(raw) as any;
    const hotzones = Array.isArray(summary.hotzones) ? summary.hotzones : [];
    const hotzoneCount = hotzones.length;
    const peakHotzoneDensity = hotzones.reduce(
      (max: number, zone: any) => Math.max(max, Number(zone?.density ?? 0)),
      0,
    );
    const regime = summarizeBehaviorRegime(hotzones);
    const anomaly = computeAnomalyScore({
      hotzones,
      pqResidualStats: summary.pqResidualStats,
      tagVector: summary.semanticTags ?? [],
    });
    return {
      peakHotzoneDensity,
      hotzoneCount,
      behavior: summary.behaviorMetrics ?? null,
      behaviorRegime: regime.label,
      anomaly,
    };
  } catch {
    return null;
  }
}

function buildContext(blocks: StoredBlockSummary[]): string {
  if (blocks.length === 0) return 'No matching blocks were found.';
  return blocks
    .slice(0, 5)
    .map(
      (block) =>
        formatBlockContext(block),
    )
    .join('\n\n');
}

function formatBlockContext(block: StoredBlockSummary) {
  const parts: string[] = [
    `Block ${block.chain} #${block.height}`,
    `Tags: ${block.tags.join(', ')}`,
  ];
  const insights = readSummaryInsights(block.summaryPath);
  if (insights) {
    parts.push(
      `Hotzones: ${insights.hotzoneCount} (peak density ≈ ${formatDensity(insights.peakHotzoneDensity)})`,
    );
    const behaviorLine = formatBehaviorHighlight(insights.behavior);
    if (behaviorLine) {
      parts.push(`Behavior: ${behaviorLine}`);
    }
    if (insights.behaviorRegime) {
      parts.push(`Regime: ${insights.behaviorRegime}`);
    }
    if (insights.anomaly) {
      const detail = insights.anomaly.breakdown
        ? `density ${insights.anomaly.breakdown.density.detail} · PQ ${insights.anomaly.breakdown.pqResidual.detail}`
        : '';
      parts.push(
        `Anomaly ${insights.anomaly.score.toFixed(2)} (${insights.anomaly.label})${detail ? ` – ${detail}` : ''}`,
      );
    }
  }
  parts.push(`Summary: ${block.summaryPath}`);
  return parts.join('\n');
}

function composePrompt(
  question: string,
  tags: string[],
  context: string,
  recentContext?: string,
  atlasInsights?: string[],
): string {
  return `Question: ${question}
Detected tags: ${tags.join(', ')}

Context:
${context}

${recentContext ? `Recent window:\n${recentContext}\n` : ''}

${atlasInsights && atlasInsights.length > 0 ? `Atlas insights:\n${atlasInsights.join('\n')}\n` : ''}

Answer the question referencing the blocks above (chain + height). If context is empty, say you could not find relevant fingerprints.`;
}

function describeRelativeAge(timestamp: number) {
  if (!timestamp) return 'unknown recency';
  const now = Date.now();
  const deltaMs = now - timestamp * 1000;
  if (deltaMs < 0) return 'just ingested';
  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return 'ingested moments ago';
  if (minutes === 1) return 'ingested 1 minute ago';
  if (minutes < 60) return `ingested ${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'ingested 1 hour ago';
  if (hours < 24) return `ingested ${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `ingested ${days} day${days === 1 ? '' : 's'} ago`;
}

function inferSource(question: string) {
  if (/avax|avalanche/i.test(question)) return 'avax';
  if (/eth(ereum)?/i.test(question)) return 'eth';
  return undefined;
}

function inferChainsFromQuestion(question: string) {
  const chains: string[] = [];
  if (/avax|avalanche/i.test(question)) chains.push('avax');
  if (/eth(ereum)?/i.test(question)) chains.push('eth');
  return chains;
}

function referencesRecentWindow(question: string) {
  return /\b(last|past)\s+(hour|60\s*minutes)\b/i.test(question) || /recent\s+hour/i.test(question);
}

function summarizeRecentWindow(blocks: StoredBlockSummary[], tags: string[]) {
  const sorted = [...blocks].sort((a, b) => a.timestamp - b.timestamp);
  const start = formatShortTime(sorted[0]?.timestamp);
  const end = formatShortTime(sorted[sorted.length - 1]?.timestamp);
  const chains = Array.from(new Set(sorted.map((block) => block.chain))).join(', ');
  const tagSet = new Set(tags);
  const matches = sorted.filter((block) =>
    block.tags.some((tag) => tagSet.has(tag)),
  );
  let tagSummary = 'No specific tag filter requested.';
  if (tagSet.size > 0) {
    tagSummary =
      matches.length > 0
        ? `${matches.length} block(s) carried the requested tags (${Array.from(tagSet).join(', ')})`
        : `0 block(s) carried the requested tags (${Array.from(tagSet).join(', ')})`;
  }
  return `Scanned ${sorted.length} block(s) across ${chains || 'ingested chains'} between ${start} and ${end}. ${tagSummary}`;
}

function formatShortTime(timestamp?: number) {
  if (!timestamp) return 'unknown time';
  return new Date(timestamp * 1000).toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: '2-digit',
  });
}

function formatDensity(value: number) {
  if (!value || Number.isNaN(value)) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(0);
}

function formatBehaviorHighlight(behavior?: BehaviorMetrics | null) {
  if (!behavior) return '';
  const parts: string[] = [];
  if (behavior.dominantFlow) {
    parts.push(`${behavior.dominantFlow.replace(/_/g, ' ')} dominant`);
  }
  if (behavior.dexGasShare > 0.05) {
    parts.push(`${formatPercent(behavior.dexGasShare)} gas from DEX swaps`);
  }
  if (behavior.nftGasShare > 0.05) {
    parts.push(`${formatPercent(behavior.nftGasShare)} gas on NFT activity`);
  }
  if (behavior.lendingVolumeWei > 0) {
    parts.push(`Lending volume ${formatWei(behavior.lendingVolumeWei)}`);
  }
  if (behavior.bridgeVolumeWei > 0) {
    parts.push(`Bridge volume ${formatWei(behavior.bridgeVolumeWei)}`);
  }
  if (behavior.highFeeTxCount > 0) {
    parts.push(`${behavior.highFeeTxCount} high-fee tx`);
  }
  const top = behavior.topContracts?.[0];
  if (top) {
    const label = top.label ?? truncateHash(top.address);
    parts.push(`Top contract ${label} (${top.txCount} tx)`);
  }
  return parts.join(' · ');
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

function formatWei(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const eth = value / 1e18;
  if (eth >= 1) return `${eth.toFixed(2)} native`;
  return `${eth.toFixed(4)} native`;
}

function truncateHash(value: string) {
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function buildAtlasInsights(question: string, tags: string[]) {
  const graph = loadAtlasGraph();
  if (!graph) return [];
  const shouldInclude =
    /\batlas\b|\bglobal\b|\btrend\b|\bspike\b|\bbehavioral map\b/i.test(question) ||
    (tags ?? []).length > 0;
  if (!shouldInclude) return [];
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const filtered = filterAtlas(graph, {
    from: now - weekMs,
    to: now,
    tags,
    limit: 3,
  });
  if (filtered.nodes.length === 0) return [];
  return filtered.nodes.map(
    (node) => {
      const start = formatShortTime(node.firstTimestamp);
      const end = formatShortTime(node.lastTimestamp);
      return `Cluster #${node.id} (${node.tags.slice(0, 3).join(', ') || 'mixed'}) has ${node.count} samples across ${node.chains.join(', ') || 'various chains'} (avg density ${formatDensity(
        node.avgDensity,
      )}) active from ${start} to ${end}.`;
    },
  );
}


