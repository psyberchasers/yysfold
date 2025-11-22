import { readFileSync } from 'node:fs';
import { NextResponse } from 'next/server';
import { searchBlocksByTag } from '@/lib/blocks';
import type { StoredBlockSummary } from '@/lib/blocks';
import { dedupeBlocks, inferTags } from '@/lib/askUtils';
import { findLendingTransactions } from '@/lib/tagEvidence';

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
  const source = body.source?.trim() || undefined;
  const limit = Number.isFinite(body.limit) ? Math.max(1, Math.min(body.limit ?? 10, 20)) : 10;

  const inferredTags = inferTags(question);
  if (inferredTags.length === 0) {
    return NextResponse.json({
      question,
      source: source ?? null,
      inferredTags: [],
      answer: 'No specific tags detected. Try mentioning NFT, DEX, AML, FX, sector names, etc.',
      references: [],
    });
  }

  const matches = dedupeBlocks(
    inferredTags.flatMap((tag) => searchBlocksByTag(tag, source, limit)),
    limit,
  );

  const context = buildContext(matches);
  const prompt = composePrompt(question, inferredTags, context);
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
    lendingTransactions,
  };
}

function readSummaryInsights(summaryPath: string):
  | { peakHotzoneDensity: number; hotzoneCount: number }
  | null {
  try {
    const raw = readFileSync(summaryPath, 'utf-8');
    const summary = JSON.parse(raw) as any;
    const hotzones = Array.isArray(summary.hotzones) ? summary.hotzones : [];
    if (hotzones.length === 0) {
      return { peakHotzoneDensity: 0, hotzoneCount: 0 };
    }
    const peakHotzoneDensity = hotzones.reduce(
      (max: number, zone: any) => Math.max(max, Number(zone?.density ?? 0)),
      0,
    );
    return { peakHotzoneDensity, hotzoneCount: hotzones.length };
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
        `Block ${block.chain} #${block.height}\nTags: ${block.tags.join(', ')}\nSummary: ${block.summaryPath}`,
    )
    .join('\n\n');
}

function composePrompt(question: string, tags: string[], context: string): string {
  return `Question: ${question}
Detected tags: ${tags.join(', ')}

Context:
${context}

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


