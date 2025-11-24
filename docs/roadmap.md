## YYSFOLD Delivery Plan

### Phase 0 — Foundations (Week 1)
- [x] Stand up dual ingestion adapters (ETH, AVAX) that emit `RawBlock` JSON.
- [x] Persist block metadata into `index.db` / `artifacts/` (raw, summary, hotzones, proof placeholders).
- [x] Define the verification contract (public inputs, commitments) and stub `/api/verify`.

### Phase 1 — Folding + PQ + KDE Pipeline (Weeks 2–3)
- [x] Implement deterministic folding (Fiat–Shamir challenge + vector folding logic).
- [x] Train PQ codebooks on historical folded vectors and hash `codebook_root`.
- [x] Implement `pq_encode` + folded/PQ commitment pipeline.
- [x] Build 4D projection + KDE with configurables (`h`, max zones) and emit per-block hotzones.

### Phase 2 — Behavioral Semantics (Week 4)
- [x] Tagging engine for per-block and per-hotzone semantics (DEX/NFT/LENDING/HIGH_FEE/etc.).
- [x] Regime classifier (top tag mix mapped to a single label).
- [x] Anomaly scoring (`1 − similarity_to_cluster`) with interpretation bands.
- [x] Record metrics + telemetry (`telemetry.db`) including gas share, volume, densities.

### Phase 3 — Atlas & Hypergraph (Weeks 5–6)
- [x] Cluster hotzone samples into global “atlas nodes” with time slices.
- [x] Build hypergraph relationships (co-occurrence, shared tags, proximity).
- [x] Expose `/api/atlas` and `/api/metrics/timeseries` endpoints.
- [x] Implement nightly job (`atlas:build`, `metrics:rollup`).

### Phase 4 — Proofs & Verification (Weeks 7–8)
- [x] Formalize Halo2 circuit (raw block → folded commitment → PQ commitment).
- [x] Generate/verify proofs for ingested blocks; wire `/api/verify`.
- [x] Ship CLI snippet (`curl ...`) + SDK helper for third parties.

### Phase 5 — Frontend & AI Layer (Weeks 9–10)
- [x] Dashboard polish: regime/anomaly chips, normalized density shares, atlas filters.
- [x] Block detail enhancements: hypergraph ↔ atlas linking, projection scatter, PQ tooltips.
- [x] Global telemetry chart (ranges, chain/tag filters, export).
- [x] AI chat upgrades: surface regime/anomaly in prompts, include top clusters, add DSL for queries.

### Phase 6 — Integration Readiness (Week 11)
- [x] Harden ingestion watcher (supervision, logging, retries, health endpoint).
- [x] Document artifact schema + API contracts for partners.
- [x] Add S3 sync/export for artifacts and telemetry snapshots.
- [x] Package SDK examples (TypeScript + Python) for consuming fingerprints & proofs.

