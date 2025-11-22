import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
export function createHalo2Backend(config) {
    const keepWorkspace = process.env.HALO2_KEEP_WORKSPACE === '1';
    return {
        prove: async ({ witness, publicInputs, params }) => {
            const workspace = createWorkspace(config.workspaceDir);
            try {
                const witnessPath = join(workspace, 'witness.json');
                const publicInputsPath = join(workspace, 'public.json');
                const proofPath = join(workspace, 'proof.bin');
                writeFileSync(witnessPath, JSON.stringify(witness), 'utf-8');
                writeFileSync(publicInputsPath, JSON.stringify(publicInputs), 'utf-8');
                await runCommand(config.proverCommand, config.proverArgs ?? [], [
                    '--witness',
                    witnessPath,
                    '--public-inputs',
                    publicInputsPath,
                    '--proving-key',
                    params.provingKeyPath,
                    '--verification-key',
                    params.verificationKeyPath,
                    '--output',
                    proofPath,
                ], config);
                const proofBytes = readFileSync(proofPath);
                return Uint8Array.from(proofBytes);
            }
            finally {
                if (!keepWorkspace) {
                    cleanupWorkspace(workspace);
                }
            }
        },
        verify: async ({ proof, params }) => {
            if (!config.verifierCommand) {
                throw new Error('Verifier command not configured for Halo2 backend');
            }
            const workspace = createWorkspace(config.workspaceDir);
            try {
                const proofPath = join(workspace, 'proof.bin');
                const publicInputsPath = join(workspace, 'public.json');
                writeFileSync(proofPath, Buffer.from(proof.proofBytes));
                writeFileSync(publicInputsPath, JSON.stringify(proof.publicInputs), 'utf-8');
                await runCommand(config.verifierCommand, config.verifierArgs ?? [], [
                    '--proof',
                    proofPath,
                    '--public-inputs',
                    publicInputsPath,
                    '--verification-key',
                    params.verificationKeyPath,
                ], config);
                return true;
            }
            finally {
                if (!keepWorkspace) {
                    cleanupWorkspace(workspace);
                }
            }
        },
    };
}
function createWorkspace(root) {
    if (root) {
        const workspace = join(root, `halo2-${Date.now().toString(16)}`);
        mkdirSync(workspace, { recursive: true });
        return workspace;
    }
    return mkdtempSync(join(tmpdir(), 'halo2-'));
}
function cleanupWorkspace(path) {
    try {
        rmSync(path, { recursive: true, force: true });
    }
    catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Failed to cleanup Halo2 workspace', error);
    }
}
function runCommand(command, baseArgs, extraArgs, config) {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn(command, [...baseArgs, ...extraArgs], {
            env: { ...process.env, ...config.env },
            stdio: 'inherit',
        });
        const timeout = config.timeoutMs
            ? setTimeout(() => {
                child.kill();
                rejectPromise(new Error(`Halo2 command timed out after ${config.timeoutMs}ms`));
            }, config.timeoutMs)
            : null;
        child.once('error', (error) => {
            if (timeout)
                clearTimeout(timeout);
            rejectPromise(error);
        });
        child.once('close', (code) => {
            if (timeout)
                clearTimeout(timeout);
            if (code === 0) {
                resolvePromise();
            }
            else {
                rejectPromise(new Error(`Halo2 command exited with code ${code}`));
            }
        });
    });
}
