import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { getBlockSummary } from '@/lib/blocks';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { chain?: string; height?: number } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.chain || body.height === undefined) {
    return NextResponse.json(
      { error: 'chain and height are required' },
      { status: 400 },
    );
  }
  const height = Number(body.height);
  if (!Number.isFinite(height)) {
    return NextResponse.json({ error: 'Invalid height' }, { status: 400 });
  }
  const record = getBlockSummary(body.chain, height);
  if (!record) {
    return NextResponse.json({ error: 'Block not found' }, { status: 404 });
  }
  const summary = JSON.parse(readFileSync(record.summaryPath, 'utf-8'));
  const proofHex = summary.proofHex;
  const publicInputs = summary.publicInputs;
  if (typeof proofHex !== 'string') {
    return NextResponse.json(
      { error: 'Proof not available for this block' },
      { status: 422 },
    );
  }
  if (!publicInputs) {
    return NextResponse.json(
      { error: 'Public inputs missing for this block' },
      { status: 422 },
    );
  }

  const digest = crypto.createHash('sha256').update(proofHex).digest('hex');
  const verifierConfig = getHalo2VerifierConfig();
  if (verifierConfig) {
    try {
      await runHalo2Verifier({
        verifierCommand: verifierConfig.command,
        verifierArgs: verifierConfig.args,
        verificationKeyPath: verifierConfig.verificationKeyPath,
        proofHex,
        publicInputs,
        timeoutMs: verifierConfig.timeoutMs,
      });
      return NextResponse.json({
        status: 'verified',
        method: 'halo2',
        digest,
        commitments: summary.commitments,
        codebookRoot: summary.codebookRoot,
      });
    } catch (error) {
      return NextResponse.json(
        {
          status: 'failed',
          method: 'halo2',
          digest,
          error: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    status: 'ok',
    method: 'digest',
    digest,
    commitments: summary.commitments,
    codebookRoot: summary.codebookRoot,
  });
}

function getHalo2VerifierConfig():
  | {
      command: string;
      args: string[];
      verificationKeyPath: string;
      timeoutMs?: number;
    }
  | null {
  const command = process.env.HALO2_VERIFIER_BIN;
  const verificationKeyPath = process.env.HALO2_VK_PATH;
  if (!command || !verificationKeyPath) {
    return null;
  }
  const args = process.env.HALO2_VERIFIER_ARGS
    ? process.env.HALO2_VERIFIER_ARGS.split(' ').filter(Boolean)
    : [];
  const timeoutMs = process.env.HALO2_TIMEOUT_MS
    ? Number.parseInt(process.env.HALO2_TIMEOUT_MS, 10)
    : undefined;
  return {
    command,
    args,
    verificationKeyPath,
    timeoutMs,
  };
}

async function runHalo2Verifier({
  verifierCommand,
  verifierArgs,
  verificationKeyPath,
  proofHex,
  publicInputs,
  timeoutMs,
}: {
  verifierCommand: string;
  verifierArgs: string[];
  verificationKeyPath: string;
  proofHex: string;
  publicInputs: unknown;
  timeoutMs?: number;
}) {
  const workspace = mkdtempSync(join(tmpdir(), 'halo2-verify-'));
  const proofPath = join(workspace, 'proof.bin');
  const publicPath = join(workspace, 'public.json');
  try {
    writeFileSync(proofPath, Buffer.from(proofHex, 'hex'));
    writeFileSync(publicPath, JSON.stringify(publicInputs), 'utf-8');
    await execCommand(
      verifierCommand,
      [...verifierArgs, '--proof', proofPath, '--public-inputs', publicPath, '--verification-key', verificationKeyPath],
      timeoutMs,
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

function execCommand(command: string, args: string[], timeoutMs?: number): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
    });
    const timeout = timeoutMs
      ? setTimeout(() => {
          child.kill();
          rejectPromise(new Error(`Verifier timed out after ${timeoutMs}ms`));
        }, timeoutMs)
      : null;
    child.once('error', (error) => {
      if (timeout) clearTimeout(timeout);
      rejectPromise(error);
    });
    child.once('close', (code) => {
      if (timeout) clearTimeout(timeout);
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`Verifier exited with code ${code}`));
      }
    });
  });
}

