import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { fetchBlockDetail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface VerifyRequest {
  chain?: string;
  height?: number;
  blockHash?: string;
  foldedCommitment?: string;
  pqCommitment?: string;
  codebookRoot?: string;
  proofHex?: string;
}

export async function POST(request: Request) {
  let body: VerifyRequest = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { chain, height } = body;
  if (!chain || height === undefined) {
    return NextResponse.json({ error: 'chain and height are required' }, { status: 400 });
  }

  const parsedHeight = Number(height);
  if (!Number.isFinite(parsedHeight)) {
    return NextResponse.json({ error: 'Invalid height' }, { status: 400 });
  }

  // Fetch block from Render API
  const data = await fetchBlockDetail(chain, parsedHeight);
  if (!data) {
    return NextResponse.json({ error: `No block summary for ${chain} #${parsedHeight}` }, { status: 404 });
  }

  const summary = data.payload;
  const record = data.record;
  
  const expected = {
    blockHash: record?.blockHash ?? null,
    foldedCommitment: summary?.commitments?.foldedCommitment ?? null,
    pqCommitment: summary?.commitments?.pqCommitment ?? null,
    codebookRoot: summary?.codebookRoot ?? null,
  };

  const mismatches: string[] = [];
  if (body.blockHash && body.blockHash !== expected.blockHash) mismatches.push('blockHash');
  if (body.foldedCommitment && body.foldedCommitment !== expected.foldedCommitment)
    mismatches.push('foldedCommitment');
  if (body.pqCommitment && body.pqCommitment !== expected.pqCommitment) mismatches.push('pqCommitment');
  if (body.codebookRoot && body.codebookRoot !== expected.codebookRoot) mismatches.push('codebookRoot');

  if (mismatches.length > 0) {
    return NextResponse.json(
      {
        status: 'commitment-mismatch',
        verified: false,
        mismatches,
        expected,
      },
      { status: 409 },
    );
  }

  const proofHex = body.proofHex ?? summary?.proofHex;
  if (typeof proofHex !== 'string' || proofHex.length === 0) {
    return NextResponse.json({ error: 'Proof not available for this block' }, { status: 422 });
  }

  const digest = crypto.createHash('sha256').update(proofHex).digest('hex');

  // ZK verification requires local verifier binary - not available on Vercel
  // Return digest-only verification
  return NextResponse.json({
    status: 'digest-only',
    method: 'digest',
    digest,
    commitments: expected,
    codebookRoot: expected.codebookRoot,
    note: 'Full ZK verification available on Render backend',
  });
}
