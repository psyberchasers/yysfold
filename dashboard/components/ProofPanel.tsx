"use client";

import { useState } from 'react';
import { CopyableText } from './CopyableText';

interface ProofPanelProps {
  chain: string;
  height: number;
  blockHash: string;
  commitments: {
    foldedCommitment?: string;
    pqCommitment?: string;
  };
  codebookRoot?: string;
  proofHex?: string;
}

type VerifyStatus = 'idle' | 'pending' | 'success' | 'error';

export function ProofPanel({
  chain,
  height,
  blockHash,
  commitments,
  codebookRoot,
  proofHex,
}: ProofPanelProps) {
  const [status, setStatus] = useState<VerifyStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handleVerify() {
    setStatus('pending');
    setMessage('Running deterministic checks…');
    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain, height }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? 'Verification failed');
      }
      setStatus('success');
      setMessage(`Proof digest ${payload.digest.slice(0, 10)}… ✔`);
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error ? error.message : 'Verification failure',
      );
    }
  }

  function copyProof() {
    if (!proofHex) return;
    navigator.clipboard.writeText(proofHex);
    setStatus('success');
    setMessage('Proof copied to clipboard');
    setTimeout(() => {
      setStatus('idle');
      setMessage(null);
    }, 2500);
  }

  const verifyDisabled = status === 'pending';
  const curlSnippet = `curl -X POST /api/verify -H 'Content-Type: application/json' -d '{"chain":"${chain}","height":${height}}'`;
  const infoItems = [
    { label: 'Folded commitment', value: commitments.foldedCommitment },
    { label: 'PQ commitment', value: commitments.pqCommitment },
    { label: 'Codebook root', value: codebookRoot },
    { label: 'Block hash', value: blockHash },
  ];

  return (
    <article className="bg-white rounded-none border border-gray-200 p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Proof & Commitments</h2>
        <p className="text-sm text-gray-500">Deterministic digest + Halo2 verification</p>
      </div>
      <dl className="grid gap-4 md:grid-cols-2 text-sm">
        {infoItems.map((item) => (
          <div key={item.label} className="flex flex-col gap-1">
            <dt className="text-xs uppercase tracking-wide text-gray-500">
              {item.label}
            </dt>
            <dd>
              <CopyableText value={item.value} label={item.label} />
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="px-4 py-2 rounded-none text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
          onClick={copyProof}
          disabled={!proofHex}
        >
          Copy proof hex
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded-none text-sm bg-accent text-white font-semibold transition disabled:opacity-60"
          onClick={handleVerify}
          disabled={verifyDisabled}
        >
          {status === 'pending' ? 'Verifying…' : 'Verify proof'}
        </button>
        <a
          href={`/api/blocks/${chain}/${height}`}
          className="px-4 py-2 rounded-none text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
        >
          Download summary JSON
        </a>
      </div>
      <div className="text-xs text-gray-500 space-y-1">
        <p>
          CURL: <span className="font-mono break-all">{curlSnippet}</span>
        </p>
        {message && (
          <p
            className={`text-sm ${
              status === 'error' ? 'text-red-500' : 'text-accent'
            }`}
          >
            {message}
          </p>
        )}
      </div>
    </article>
  );
}

