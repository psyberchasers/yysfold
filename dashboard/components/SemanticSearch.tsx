"use client";

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BlockPreview } from './BlockPreview';
import { CopyableText } from './CopyableText';

interface SearchResult {
  chain: string;
  height: number;
  blockHash: string;
  timestamp: number;
  tags: string[];
}

export function SemanticSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}&limit=12`,
          { signal: controller.signal },
        );
        const payload = await response.json();
        setResults(payload.results ?? []);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error(error);
        }
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs uppercase tracking-wide text-gray-500">
          Semantic search
        </label>
        <div className="mt-2 relative">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tags, chains, block hashes…"
            className="w-full bg-white border border-gray-300 rounded-full px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
          />
          {loading && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500">
              …
            </span>
          )}
        </div>
      </div>
      <div className="max-h-64 overflow-auto divide-y divide-gray-200 border border-gray-200 rounded-none bg-white">
        {query.trim().length === 0 && (
          <p className="text-sm text-gray-500 p-4">
            Type “NFT”, “DEX”, “HIGH_FEE”, block hashes, or heights to jump to
            matching summaries.
          </p>
        )}
        {query.trim().length > 0 && results.length === 0 && !loading && (
          <p className="text-sm text-gray-500 p-4">No matches.</p>
        )}
        {results.map((result) => (
          <div
            key={`${result.chain}-${result.height}`}
            className="flex flex-col gap-1 p-4 hover:bg-gray-50 transition border-b border-gray-100 last:border-b-0"
          >
            <div className="flex items-center justify-between">
              <Link
                href={`/blocks/${result.chain}/${result.height}`}
                className="text-sm font-mono text-gray-900"
              >
                {result.chain} · #{result.height}
              </Link>
              <BlockPreview chain={result.chain} height={result.height} />
            </div>
            <CopyableText
              value={result.blockHash}
              label="block hash"
              truncateAt={12}
              className="text-xs text-gray-500"
            />
            <div className="flex flex-wrap gap-2 text-[11px] text-accent">
              {result.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-full border border-gray-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

