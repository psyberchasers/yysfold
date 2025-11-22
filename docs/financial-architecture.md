# Financial Data Folding Architecture

This document maps the existing block-folding + PQ + KDE stack onto multi-source financial data (equities, FX, derivatives, AML, risk telemetry, etc.) and defines the adapters, scheduling, and analytics required to build the “behavioral heartmap” across all domains.

---

## 1. Conceptual Overview

| Layer | Responsibility | Notes |
| --- | --- | --- |
| **Adapters** | Convert native feeds (trades, positions, AML alerts, risk vectors) into the canonical `RawBlock` format (header + transactions + traces + witness metadata). | Each adapter defines what one “block” means (e.g., 10k trades, 1-minute snapshot, daily AML batch). |
| **Vectorization** | Normalize numeric/categorical features into fixed-length vectors (`vectorizeBlock`). | Reuse existing normalization logic but allow adapters to pass contextual metadata (asset class, venue, counterparty, sector). |
| **Folding** | Aggregate per-block vectors into smooth DCT-based components (`foldVectors`). | Same deterministic folding matrix across domains keeps PQ + KDE comparable. |
| **Product Quantization** | Compress folded vectors into centroid indices (`pqEncode`). | Codebooks can be global or per-domain; both are supported (see §4). |
| **KDE + Hotzones** | Run 4D KDE on PQ-decoded vectors to identify dense regions (hotzones). | Attach semantic tags derived from adapters (e.g., `FX_VOLATILITY`, `AML_ALERT`). |
| **Hypergraph** | Connect hotzones + regimes into a relational map of market/behavioral states. | Hyperedges can encode correlations, shared counterparties, or synchronized anomalies. |
| **Analytics Surface** | Dashboards, APIs, and downstream consumers read from `artifacts/index.db` and the block summaries to power search, alerts, and visualizations. | Source filters + tag spotlights highlight regimes across domains. |

---

## 2. Adapter Design

Each adapter implements a simple interface:

```ts
interface FinancialAdapter<TInput = unknown> {
  readonly name: string;          // e.g., 'equities', 'fx', 'aml'
  readonly source: string;        // human label (for storage paths, tags)
  toRawBlock(input: TInput): RawBlock;
}
```

Guidelines:

1. **Batch definition**  
   - Equities: e.g., 10k trades or 1-minute time slices.  
   - FX: aggregated trades per currency pair/time bucket.  
   - AML: daily alerts per client cluster.  
   - Derivatives/Risk: portfolio exposures per strategy.

2. **Header metadata**  
   - `height`: monotonically increasing per adapter (e.g., timestamp-based).  
   - `prevStateRoot` / `newStateRoot`: can encode previous + current hash for auditing.  
   - `txMerkleRoot`: optional, use e.g., hash of transactions array for extra integrity.

3. **Transactions payload**  
   - Use consistent keys (`amount`, `fee`, `gasPrice`, etc.) but reinterpret them:  
     - `amount` → notional or quantity  
     - `gasPrice` → transaction cost / spread  
     - `chainId` → asset class or venue code  
     - `contractType` → product type (spot, option, swap, AML rule)
   - Include adapter-specific metadata (`sector`, `currencyPair`, `riskScore`, etc.).

4. **Execution traces / witness data**  
   - Mirror analytics needs: `balanceDelta` → PnL change, `storageWrites` → order book depth updates, `logEvents` → triggered rules.  
   - `witnessData` bundles can record model stats (value-at-risk, ML confidences, AML severity).

5. **Semantic tags**  
   - During ingestion, adapters emit domain-specific tags (e.g., `FX_VOL_HIGH`, `AML_ALERT_RED`).  
   - Tags feed directly into analytics (hotzones, dashboards, search).

---

## 3. Scheduling + Storage

### 3.1 Continuous ingest

- Use `scripts/watchIngest.ts` to keep blockchain pipelines up to date.
- Extend with per-adapter watchers (e.g., `npm run ingest:financial -- --adapter=equities --input=...` or direct API fetchers).
- Persist outputs in `artifacts/blocks/<source>/<height>/`.
- Index everything in `artifacts/index.db` via the same schema (add a `source` column if needed).

### 3.2 Historical backfill

- `scripts/backfillBlocks.ts` handles chain backfills; analogous scripts can snapshot financial history (e.g., historical equities).  
- Store snapshots under `artifacts/snapshots/<source>/` for reproducible training.

### 3.3 Monitoring

- Log ingest cycle time, PQ error percentiles, and tag counts per source.  
- Attach alerts if ingest stalls, RPCs fail, or KDE densities drift abnormally.

---

## 4. Codebook Strategy

1. **Training pipeline**  
   - `scripts/trainCodebook.ts` already consumes `foldedVectors.jsonl`. Extend it to accept `--filter-source=<source>` or combine multiple sources via weighting.  
   - Store each trained book as `artifacts/codebooks/<source>-vX.json` with metadata `{ vectorCount, blockCount, chains/sources, params }`.

2. **Deployment**  
   - Ingestion loads `CODEBOOK_PATH` (`artifacts/codebooks/latest.json` by default).  
   - For per-source books, pass `CODEBOOK_PATH` per adapter (e.g., equities watcher uses equities book).

3. **Versioning**  
   - Embed `codebookRoot` in each block summary (already baked into the pipeline).  
   - Dashboard should display the codebook version to correlate analytics with the exact centroid set.

---

## 5. Analytics & Semantics

### 5.1 Semantic tags

- Extend `analytics/tags.ts` to include financial heuristics:  
  - Volatility regimes (`VOL_HIGH`, `VOL_LOW`).  
  - Liquidity (`LIQUIDITY_CRUNCH`, `DEEP_MARKET`).  
  - AML statuses (`AML_ALERT_RED`, `AML_CLEAR`).  
  - Risk signals (`RISK_LEVERAGED`, `SYSTEMIC_STRESS`).

### 5.2 Hotzones + Hypergraph

- Hotzone semantics now include cross-domain labels.  
- Hyperedges can be wired using:  
  - Shared tags (same regime).  
  - Correlated time windows (adjacent heights).  
  - Counterparty/sector overlaps.

### 5.3 Dashboards

- Add source-level spotlights (Equities / FX / AML / Chain).  
- Expand Semantic Search to accept queries like “FX_VOL_HIGH zone with AML alerts.”  
- Provide risk/AML views that list anomalous hotzones and link to proofs/commitments.

---

## 6. Proofs & Verification

- `/api/verify` already supports digest-only mode and optional Halo2 CLI verification.  
- Once real proofs are enabled (replace mock backend with Halo2 backend), verification remains identical regardless of source—the public inputs include source metadata + commitments.  
- Consider storing `source` in public inputs for future source-specific circuits or aggregated proofs.

---

## 7. Implementation Roadmap

1. **Adapters**  
   - Implement `financial/adapters/{equities,fx,aml}.ts` → `RawBlock`.  
   - Provide sample JSON inputs + CLI (`scripts/ingestFinancial.ts`) for manual runs.

2. **Continuous ingest**  
   - Extend `watchIngest` to call adapters or build a dedicated `watchFinancialIngest.ts` that pulls from queues / APIs.

3. **Codebook automation**  
   - Nightly job: run ingestion snapshot → `npm run codebook:train` → update `CODEBOOK_PATH`.  
   - Store previous versions + metadata.

4. **Dashboard updates**  
   - Source filters, spotlights, search facets, and detail panels for equities/FX/AML data.  
   - Risk/AML overlays (color-coded tags, anomaly counts).

5. **Monitoring**  
   - Add structured logs + metrics (ingest frequency, PQ error histograms, halo2 verification stats).  
   - Optionally push metrics to Prometheus/Grafana.

By following these steps we converge on the “behavioral heatmap” across blockchain & traditional finance, with verifiable PQ fingerprints, interpretable analytics, and extensible ingestion.


