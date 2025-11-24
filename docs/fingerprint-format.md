# Fingerprint Format

This document describes the JSON payload we publish for each folded block (or financial batch) so exchanges, risk desks, and downstream services can ingest the same fingerprints we render on the dashboard.

The authoritative machine-readable specification lives in [`docs/schema/fingerprint.schema.json`](./schema/fingerprint.schema.json). Every object exported should validate against that schema.

## Envelope

```jsonc
{
  "chain": "eth",
  "height": 23865544,
  "blockHash": "0x…",
  "timestamp": 1732307123,
  "commitments": {
    "foldedCommitment": "…",
    "pqCommitment": "…",
    "codebookRoot": "…"
  },
  "foldedBlock": { "foldedVectors": [...], "metadata": {...} },
  "pqCode": { "indices": [...] },
  "pqResiduals": [...],
  "pqResidualStats": { "average": 0.041, "p95": 0.214, "max": 0.388, "count": 18 },
  "hotzones": [...],
  "hypergraph": {...},
  "behaviorMetrics": {...},
  "behaviorRegime": "DEX_ACTIVITY",
  "anomaly": { "score": 0.62, "label": "Unusual", "breakdown": {...} },
  "proof": {
    "proofHex": "0x…",
    "publicInputs": { "...": "..." }
  },
  "artifacts": {
    "block": "/api/artifacts/blocks/eth/23865544/raw-block.json",
    "summary": "/api/artifacts/blocks/eth/23865544/summary.json",
    "proof": "/api/artifacts/blocks/eth/23865544/proof.json"
  }
}
```

### Key Sections

| Section            | Purpose                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| `commitments`      | BLAKE3 commitments that bind folded vectors + PQ indices to a codebook revision                   |
| `foldedBlock`      | Deterministic fold (mean, variance, component projections) with metadata (height/tx count/etc.)    |
| `pq*`              | Product-quantised representation plus residual metrics tying back to the trained error bound      |
| `hotzones`         | Local KDE clusters per block (density, semantic tags, optional share/percentile)                  |
| `behaviorMetrics`  | Gas splits, lending / bridge volume, high-fee counts, top contracts, dominant flow                |
| `anomaly`          | Unified anomaly score that blends density, PQ residuals, and tag rarity (with detailed breakdown) |
| `proof`            | Halo2 proof (hex) and the public inputs fed to the circuit                                        |
| `artifacts`        | Optional URLs for raw JSON artifacts (served via `/api/artifacts/...`)                            |

### Codebook root vs proof

The `codebookRoot` inside `commitments` matches the value referenced in the Halo2 public inputs. It now includes the centroid matrix **and** normalization/error-bound metadata, so different codebook revisions cannot collide.

## Verification Flow

1. Fetch the fingerprint (either from the exported JSON bundle or via `/api/artifacts/.../summary.json`).
2. Inspect `commitments.*` to link the fingerprint to its codebook revision.
3. POST to `/api/verify` with `{ chain, height, blockHash, foldedCommitment, pqCommitment, codebookRoot }`.
4. The API re-loads the summary, compares commitments, and—if `HALO2_VERIFIER_BIN`/`HALO2_VK_PATH` are configured—launches the Halo2 verifier binary with the stored proof.
5. A `status: "verified"` response means the Halo2 verifier exited successfully; `status: "failed"` includes the digest plus the CLI error if anything went wrong. When the verifier binary is not present the API falls back to a digest-only check (`status: "digest-only"`).

> See [`docs/zk.md`](./zk.md) for the full rundown of public inputs, hash-to-field rules, and the fixed-point scaling used inside the Halo2 circuit.

## Consuming the schema

To validate fingerprints client-side:

```bash
npm install --save ajv
```

```ts
import Ajv from 'ajv';
import schema from '../docs/schema/fingerprint.schema.json';

const ajv = new Ajv();
const validate = ajv.compile(schema);
const valid = validate(fingerprint);
if (!valid) {
  console.error(validate.errors);
}
```

> **Tip:** include the `chain` and `height` wrapper even if you only store the raw `summary.json`. Those identifiers are not present inside the summary payload itself.

## Backwards compatibility

Older summaries (without `pqResidualStats`, `anomaly.breakdown`, or `behaviorRegime`) remain readable—those properties are optional in the schema. We recommend backfilling telemetry and regenerating fingerprints so all exported objects include the richer metadata.

