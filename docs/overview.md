# Block Folding + ZK Overview

This document tracks the block-folding prototype so we can see what already exists and plan next steps without scrolling through the entire repo.

## Current Modules

- `folding/`: defines the core data shapes and deterministic pipeline (`vectorizeBlock` → `foldVectors` → `pqEncode` → `hash*`). `computeFoldedBlock` stitches those steps together; `codebook.ts` can mint deterministic PQ codebooks + consistency checks.
- `analytics/`: operates on PQ codes. `hotzones.ts` decodes PQ vectors and runs a lightweight KDE to label dense clusters, while `hypergraph.ts` links those clusters into pair/triple hyperedges for layout/visualization.
- `zk/`: contains the circuit narrative (`circuit_spec.md`), the data plumbing for public inputs/witnesses, and two backends: `mockBackend` (BLAKE3 placeholder) and `halo2Backend` (shells out to the real Halo2 binaries).
- `fixtures/`: `mockBlock.ts` creates seeded synthetic blocks so every run of the pipeline is reproducible.
- `halo2/`: standalone Rust crate (requires nightly) that implements a minimal Halo2 circuit (commitment equality) plus CLI binaries: `prover` (consumes witness/public JSON, emits a real KZG proof) and `verifier` (checks those proofs). Build via `npm run halo2:build` before running the Halo2 backend.
- `scripts/codebookCli.ts`: helper for minting and inspecting PQ codebooks. `npm run codebook -- --action=generate --version=dct-v1 --num-subspaces=4 --subvector-dim=4 --num-centroids=64 --seed=pipeline --output artifacts/codebooks/dct-v1.json` writes a manifest with centroids, metadata, and the commitment root; `--action=info --file ...` prints an existing entry.
- `scripts/trainCodebook.ts`: ingests `artifacts/training/foldedVectors.jsonl`, runs a deterministic per-subspace K-means (seeded for reproducibility), and emits a codebook JSON (default `artifacts/codebooks/latest.json`). The ingest pipeline auto-loads this file (or `CODEBOOK_PATH`) instead of the toy random codebook.
- `scripts/runPipeline.ts`: end-to-end demo that vectorizes a mock block, folds it, PQ-encodes, runs the prover, and emits hotzones + hypergraph JSON to `artifacts/pipeline-output.json`. Accepts CLI flags (e.g. `--tx-count`, `--block-seed`, `--codebook-subvector-dim`, `--pq-error`, `--backend=mock|halo2`, `--halo2-prover`, `--halo2-verifier`, `--output`, `--summary`, `--hotzones-csv`) so we can sweep scenarios, toggle proving backends, and generate dashboard-friendly artifacts (JSON + CSV) without touching the source.
- `dashboard/`: Next.js + Tailwind dashboard that can be deployed to Vercel. It serves API endpoints (`/api/blocks/latest`, `/api/blocks/:chain/:height`) reading from `artifacts/index.db` and renders the most recent block with tags, hotzones, and hypergraph metadata.
- `dashboard/app/blocks/[chain]/[height]`: block detail view showing commitments, hotzones, hypergraph, folded vectors, PQ stats, and proof actions for any ingested block.
- `docs/financial-architecture.md`: blueprint for extending the folding/PQ/KDE stack to equities, FX, AML feeds, risk telemetry, etc. Covers adapter interfaces, scheduling, codebook strategy, and dashboard semantics for a cross-domain “behavioral heartmap.”

### Halo2 backend quickstart

1. Install the nightly toolchain once: `rustup toolchain install nightly`.
2. Build the binaries: `npm run halo2:build` (outputs `halo2/target/release/prover` and `.../verifier`).
3. Run the pipeline with `--backend=halo2` (defaults expect the binaries above and will create key-config JSONs in `artifacts/halo2-proving.json` + `artifacts/halo2-verifier.json`).
4. Optional debugging: set `HALO2_KEEP_WORKSPACE=1` when running the pipeline to retain the scratch directory under `artifacts/halo2-workspace/` (contains the witness/public JSON that the CLI consumed).
5. The CLI accepts overrides (`--halo2-prover`, `--halo2-verifier`, `--halo2-workspace`, `--halo2-timeout`) if you want to point at different binaries or sandboxes.

### Dashboard (Next.js + Vercel)

- Source lives in `dashboard/`.
- Install dependencies and run locally:
  ```bash
  cd dashboard
  npm install
  DATA_DIR=../artifacts npm run dev
  ```
  `DATA_DIR` should point to the directory that contains `index.db` and the saved block artifacts.
- API routes exposed:
  - `GET /api/blocks/latest`
  - `GET /api/blocks/[chain]/[height]`
  Both return the stored metadata plus the parsed JSON summary (folded vectors, PQ info, hotzones, hypergraph, tags).
- Tag spotlights summarize NFT / DEX / high-fee / large-value / lending activity and link to the freshest block detail view. Filter chips (`?tag=NFT_ACTIVITY`) and the semantic-search box feed server-side queries against `artifacts/index.db`.
- Deploy on Vercel like any Next.js project; configure `DATA_DIR` (or migrate the SQLite data to a hosted DB) via environment variables.
- `/api/verify` defaults to hashing the stored proof hex for instant feedback. If `HALO2_VERIFIER_BIN` + `HALO2_VK_PATH` (and optional `HALO2_VERIFIER_ARGS`, `HALO2_TIMEOUT_MS`) are set, the route shells out to the Halo2 verifier CLI with the stored proof/public inputs before returning.

## Data Flow Today

1. **Raw block ingest** (`RawBlock`): header + tx list + execution traces + witness bundles.
2. **Vectorization** (`vectorizeBlock`): normalizes numeric fields, hashes categorical ones into buckets, outputs fixed-length `tx/state/witness` vectors.
3. **Folding** (`foldVectors`): resizes all vectors to a canonical dimension, computes mean/variance, and projects onto a deterministic DCT-based linear basis (see `folding/componentMatrix.ts`). Component matrices can be supplied via JSON/CLI when we want to evolve the folding operator; each basis carries a version tag for auditing. (Codebook manifests now follow the same pattern via `scripts/codebookCli.ts`.)
4. **Product quantization** (`pqEncode`): splits each folded vector into subvectors, snaps them to codebook centroids, and records centroid indices. Strict error bounds are enforced (configurable via CLI/tests) so we know the decode error ≤ ε before entering the circuit.
5. **Commitments** (`hashFoldedBlock`, `hashPQCode`): BLAKE3 hashes of folded vectors + PQ indices; paired with `hashCodebookRoot` to fix the codebook that PQ references. `zk/publicInputs.ts` uses the same helpers, so off-chain + circuit commitments stay aligned.
6. **ZK plumbing**: `buildCircuitWitness` + `buildPublicInputs` prepare data for a prover. `mockBackend` mimics proofs for dev cycles, and `halo2Backend.ts` defines how we’ll talk to real Halo2 binaries (witness/public input files in ↔ proof bytes out).
7. **Analytics** (optional layer): `detectHotzones` reconstructs approximate vectors via PQ decode and runs KDE; `buildHypergraph` converts hotzones to human-annotated blobs/edges for visualization.

## Gaps / Next Focus

- **Codebook lifecycle**: expand beyond deterministic toy codebooks to support versioning/rotation plus on-chain registry entries (currently just seeded generation).
- **Deterministic folding math**: current pseudo-components are heuristic. Decide on PCA/low-rank matrix or well-defined linear maps that mirror what we can encode inside a circuit.
- **Fixed-point + Halo2 integration**: formalize the fixed-point layout (scales, range proofs) and wire `halo2Backend.ts` up to real prover binaries.
- **Analytics validation**: create sample PQ codes, run `detectHotzones` → `buildHypergraph`, and snapshot outputs (JSON + CSV + markdown) for future UI prototypes.

## Immediate TODO Candidates

1. Finalize fixed-point specs in `zk/circuit_spec.md` (range tables, PQ ε enforcement, Poseidon/BLAKE options) and start implementing Halo2 gadgets.
2. Produce sample hypergraph + hotzone snapshots (JSON + markdown) to drive upcoming UI prototypes.
3. Automate PQ/codebook versioning: add registry metadata + command to print commitment roots for embedding into contracts.

Add/update this file whenever major architectural or planning decisions change so future sessions can jump in quickly.

