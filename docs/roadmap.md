## YYSFOLD Delivery Plan

### Phase 0 — Foundations (Week 1)
- [ ] Stand up dual ingestion adapters (ETH, AVAX) that emit `RawBlock` JSON.
- [ ] Persist block metadata into `index.db` / `artifacts/` (raw, summary, hotzones, proof placeholders).
- [ ] Define the verification contract (public inputs, commitments) and stub `/api/verify`.

### Phase 1 — Folding + PQ + KDE Pipeline (Weeks 2–3)
- [ ] Implement deterministic folding (Fiat–Shamir challenge + vector folding logic).
- [ ] Train PQ codebooks on historical folded vectors and hash `codebook_root`.
- [ ] Implement `pq_encode` + folded/PQ commitment pipeline.
- [ ] Build 4D projection + KDE with configurables (`h`, max zones) and emit per-block hotzones.

### Phase 2 — Behavioral Semantics (Week 4)
- [ ] Tagging engine for per-block and per-hotzone semantics (DEX/NFT/LENDING/HIGH_FEE/etc.).
- [ ] Regime classifier (top tag mix mapped to a single label).
- [ ] Anomaly scoring (`1 − similarity_to_cluster`) with interpretation bands.
- [ ] Record metrics + telemetry (`telemetry.db`) including gas share, volume, densities.

### Phase 3 — Atlas & Hypergraph (Weeks 5–6)
- [ ] Cluster hotzone samples into global “atlas nodes” with time slices.
- [ ] Build hypergraph relationships (co-occurrence, shared tags, proximity).
- [ ] Expose `/api/atlas` and `/api/metrics/timeseries` endpoints.
- [ ] Implement nightly job (`atlas:build`, `metrics:rollup`).

### Phase 4 — Proofs & Verification (Weeks 7–8)
- [ ] Formalize Halo2 circuit (raw block → folded commitment → PQ commitment).
- [ ] Generate/verify proofs for ingested blocks; wire `/api/verify`.
- [ ] Ship CLI snippet (`curl ...`) + SDK helper for third parties.

### Phase 5 — Frontend & AI Layer (Weeks 9–10)
- [ ] Dashboard polish: regime/anomaly chips, normalized density shares, atlas filters.
- [ ] Block detail enhancements: hypergraph ↔ atlas linking, projection scatter, PQ tooltips.
- [ ] Global telemetry chart (ranges, chain/tag filters, export).
- [ ] AI chat upgrades: surface regime/anomaly in prompts, include top clusters, add DSL for queries.

### Phase 6 — Integration Readiness (Week 11)
- [ ] Harden ingestion watcher (supervision, logging, retries, health endpoint).
- [ ] Document artifact schema + API contracts for partners.
- [ ] Add S3 sync/export for artifacts and telemetry snapshots.
- [ ] Package SDK examples (TypeScript + Python) for consuming fingerprints & proofs.

