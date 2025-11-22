'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { BlockPreview } from './BlockPreview';
import { CopyableText } from './CopyableText';
import type { LendingTransactionEvidence } from '@/lib/tagEvidence';

interface ChatPanelProps {
  sources: string[];
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tags?: string[];
  references?: ChatReference[];
  status?: 'loading' | 'error' | 'done';
  primaryReference?: ChatReference | null;
}

interface ChatReference {
  chain: string;
  height: number;
  tags: string[];
  timestamp?: number;
  relativeAge?: string;
  peakHotzoneDensity?: number | null;
  hotzoneCount?: number | null;
  lendingTransactions?: LendingTransactionEvidence[];
}

export function ChatPanel({ sources }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'intro',
      role: 'assistant',
      content:
        'Ask about blocks with NFT storms, DEX volatility, AML alerts, or financial adapters. I will cite the exact chain + height pulled from folded fingerprints.',
      tags: [],
      status: 'done',
    },
  ]);
  const [question, setQuestion] = useState('');
  const [source, setSource] = useState<string>('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceOptions = useMemo(
    () => ['ALL', ...sources.filter((value, index, arr) => arr.indexOf(value) === index)],
    [sources],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || loading) return;
    const text = question.trim();
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      status: 'done',
    };
    const pendingMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: 'Analyzing fingerprints…',
      status: 'loading',
    };
    setMessages((prev) => [...prev, userMessage, pendingMessage]);
    setQuestion('');
    setLoading(true);
    setError(null);
    try {
      const payload = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: text,
          source: source === 'ALL' ? undefined : source,
        }),
      });
      const data = await payload.json();
      if (!payload.ok) {
        throw new Error(data.error ?? 'Chat endpoint failed');
      }
      setMessages((prev) =>
        prev.map((message) =>
          message.id === pendingMessage.id
            ? {
                ...message,
                content: data.answer ?? 'No answer returned.',
                tags: data.inferredTags ?? [],
                references: data.references ?? [],
                primaryReference: data.primaryReference ?? null,
                status: 'done',
              }
            : message,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown chat error';
      setError(message);
      setMessages((prev) =>
        prev.map((item) =>
          item.status === 'loading'
            ? { ...item, status: 'error', content: message }
            : item,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border border-gray-200 bg-white p-4 rounded-none">
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 md:flex-row md:items-center"
        >
          <input
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about NFT spikes, FX contagion, AML alerts…"
            className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
            disabled={loading}
          />
          <select
            value={source}
            onChange={(event) => setSource(event.target.value)}
            className="border border-gray-300 rounded-full px-3 py-2 text-sm text-gray-700 bg-white"
            disabled={loading}
          >
            {sourceOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'ALL' ? 'All sources' : option}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="px-4 py-2 rounded-none text-sm bg-accent text-white font-semibold disabled:opacity-60"
            disabled={loading || !question.trim()}
          >
            {loading ? 'Sending…' : 'Ask'}
          </button>
        </form>
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
      </div>

      <div className="border border-gray-200 bg-white rounded-none h-[520px] overflow-y-auto divide-y divide-gray-100">
        {messages.map((message) => (
          <article key={message.id} className="p-4 space-y-3">
            <header className="flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
              <span>{message.role === 'user' ? 'You' : 'Analyst'}</span>
              {message.tags && message.tags.length > 0 && (
                <span className="text-[11px] text-accent">
                  Tags: {message.tags.join(', ')}
                </span>
              )}
            </header>
            <p className="text-sm text-gray-900 whitespace-pre-line">{message.content}</p>
            {message.primaryReference && (
              <div className="border border-gray-200 rounded-none p-3 text-xs text-gray-600 space-y-1">
                <div className="flex flex-wrap gap-2">
                  <span className="font-mono text-gray-900">
                    {message.primaryReference.chain} · #{message.primaryReference.height}
                  </span>
                  {message.primaryReference.relativeAge && (
                    <span>{message.primaryReference.relativeAge}</span>
                  )}
                </div>
                {message.primaryReference.peakHotzoneDensity != null && (
                  <span>
                    Peak hotzone density ≈{' '}
                    {formatDensity(message.primaryReference.peakHotzoneDensity)}
                  </span>
                )}
                {message.primaryReference.hotzoneCount != null && (
                  <span>Hotzones detected: {message.primaryReference.hotzoneCount}</span>
                )}
                {message.primaryReference.lendingTransactions &&
                  message.primaryReference.lendingTransactions.length > 0 && (
                    <div className="space-y-1 pt-1">
                      <span className="block text-[11px] uppercase tracking-wide text-gray-500">
                        Lending triggers
                      </span>
                      <ul className="space-y-1">
                        {message.primaryReference.lendingTransactions.map((tx) => (
                          <li key={tx.hash} className="text-[11px] text-gray-700 flex flex-col">
                            <CopyableText
                              value={tx.hash}
                              label="transaction hash"
                              truncateAt={12}
                              className="text-[11px] text-gray-700"
                            />
                            <span>
                              {tx.protocol} · {formatEth(tx.amountEth)} ETH
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            )}
            {message.references && message.references.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-xs uppercase tracking-wide text-gray-500">References</p>
                <div className="flex flex-wrap gap-3">
                  {message.references.map((reference) => (
                    <ReferenceCard key={`${reference.chain}-${reference.height}`} reference={reference} />
                  ))}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function ReferenceCard({ reference }: { reference: ChatReference }) {
  const blockUrl = `/blocks/${reference.chain}/${reference.height}`;
  return (
    <div className="border border-gray-200 rounded-none p-3 flex flex-col gap-2 min-w-[220px]">
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span className="font-mono text-gray-900">
          {reference.chain} · #{reference.height}
        </span>
        <Link href={blockUrl} className="text-accent underline text-[11px]">
          View
        </Link>
      </div>
      {reference.relativeAge && (
        <span className="text-[10px] text-gray-500">{reference.relativeAge}</span>
      )}
      {reference.peakHotzoneDensity != null && (
        <span className="text-[10px] text-gray-600">
          Peak density {formatDensity(reference.peakHotzoneDensity)}
        </span>
      )}
      {reference.lendingTransactions && reference.lendingTransactions.length > 0 && (
        <span className="text-[10px] text-gray-600">
          Lending tx: {reference.lendingTransactions.length}
        </span>
      )}
      <div className="flex flex-wrap gap-1 text-[10px] text-accent">
        {reference.tags.slice(0, 4).map((tag) => (
          <span key={tag} className="px-2 py-0.5 border border-gray-300 rounded-full">
            {tag}
          </span>
        ))}
      </div>
      <BlockPreview chain={reference.chain} height={reference.height} />
    </div>
  );
}

function formatDensity(value: number) {
  if (!Number.isFinite(value)) return 'n/a';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

function formatEth(value: number) {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 1) return value.toFixed(2);
  if (Math.abs(value) >= 0.01) return value.toFixed(3);
  return value.toExponential(2);
}


