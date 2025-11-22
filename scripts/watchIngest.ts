import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

interface WatchOptions {
  chains: string[];
  batchSize: number;
  intervalMs: number;
  maxFailures: number;
  env: Record<string, string>;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  // eslint-disable-next-line no-console
  console.log(
    `[watch-ingest] Starting watcher (chains=${options.chains.join(',')} batch=${options.batchSize} interval=${options.intervalMs}ms)`,
  );
  let failureCount = 0;

  while (true) {
    const start = Date.now();
    try {
      await runIngest(batchCommand(options), options.env);
      failureCount = 0;
    } catch (error) {
      failureCount += 1;
      // eslint-disable-next-line no-console
      console.error(`[watch-ingest] Ingest failed (${failureCount}/${options.maxFailures}):`, error);
      if (failureCount >= options.maxFailures) {
        // eslint-disable-next-line no-console
        console.error('[watch-ingest] Max failures reached, exiting.');
        process.exit(1);
      }
    }
    const elapsed = Date.now() - start;
    const delay = Math.max(0, options.intervalMs - elapsed);
    if (delay > 0) {
      // eslint-disable-next-line no-console
      console.log(`[watch-ingest] Sleeping ${delay}ms before next batch.`);
      await sleep(delay);
    }
  }
}

function parseArgs(argv: string[]): WatchOptions {
  const options: WatchOptions = {
    chains: ['eth'],
    batchSize: 25,
    intervalMs: 60_000,
    maxFailures: 5,
    env: {},
  };
  argv.forEach((token) => {
    if (token.startsWith('--chains=')) {
      options.chains = token
        .slice('--chains='.length)
        .split(',')
        .map((chain) => chain.trim())
        .filter(Boolean);
    } else if (token.startsWith('--batch=')) {
      options.batchSize = Number.parseInt(token.slice('--batch='.length), 10);
    } else if (token.startsWith('--interval=')) {
      options.intervalMs = Number.parseInt(token.slice('--interval='.length), 10);
    } else if (token.startsWith('--max-failures=')) {
      options.maxFailures = Number.parseInt(token.slice('--max-failures='.length), 10);
    } else if (token.startsWith('--env=')) {
      token
        .slice('--env='.length)
        .split(',')
        .forEach((entry) => {
          const [key, value] = entry.split('=');
          if (key && value) {
            options.env[key] = value;
          }
        });
    }
  });
  return options;
}

function batchCommand(options: WatchOptions) {
  return [
    'npm',
    'run',
    'ingest',
    '--',
    `--chains=${options.chains.join(',')}`,
    `--count=${options.batchSize}`,
  ];
}

function runIngest(args: string[], env: Record<string, string>): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    // eslint-disable-next-line no-console
    console.log('[watch-ingest] Spawning:', args.join(' '));
    const child = spawn(args[0], args.slice(1), {
      stdio: 'inherit',
      env: { ...process.env, ...env },
    });
    child.once('error', (error) => rejectPromise(error));
    child.once('close', (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(new Error(`Ingest exited with code ${code}`));
      }
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  });
}

