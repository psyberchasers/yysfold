# Cloud Deployment Plan (Render + Vercel)

This document captures the deployment approach for running YYSFOLD as a cloud-native service. The frontend (Next.js dashboard) will live on Vercel, while Render will host the background ingestion workers, mempool watcher, data API, and SSE heartbeat. Artifacts and SQLite data remain on persistent storage mounted to the Render services.

---

## 1. Service Topology

| Layer | Platform | Description |
| --- | --- | --- |
| Dashboard Frontend | Vercel | Next.js app (`/dashboard`) built from GitHub main branch. Calls the backend API via `NEXT_PUBLIC_DATA_API_URL`. |
| Data API + SSE | Render (Web Service) | Node/Express server exposing REST endpoints for summaries, artifacts, mempool snapshots, predictions, and `/heartbeat` SSE. Shares persistent disk with workers. |
| Ingestion Worker | Render (Background Worker) | Runs `node dist/scripts/watchIngest.js` continuously to pull blocks across chains. Requires RPC credentials + shared artifacts directory. |
| Mempool Worker | Render (Background Worker) | Runs `node dist/scripts/mempoolWatch.js`, generates rolling snapshots, predictions, and writes to artifacts. |
| Optional Atlas Builder | Render (Cron Job) | Periodic `node dist/scripts/buildAtlas.js` to refresh global hypergraph. |
| Artifact Storage | Render Persistent Disk | Attached to API + workers. Contains `artifacts/` directory (SQLite DBs, JSON, proofs). |
| Secrets Management | Render & Vercel Env Vars | RPC URLs, ngrok tokens, Halo2 verifier paths, SSE salts, etc. |

---

## 2. Backend API Scope

The new API service (implemented under `api/server.ts`) will encapsulate direct filesystem/database access so the dashboard can operate remotely. Endpoints:

- `GET /healthz` – readiness check.
- `GET /dashboard` – latest summary payload (mirror of current `loadDashboardData` bundle).
- `GET /blocks/:chain/:height` – block detail payload with artifacts + hotzones.
- `GET /blocks/recent?limit=&tag=&chain=` – paginated summary list.
- `GET /atlas` – atlas graph data + latent nodes.
- `GET /mempool` – latest mempool snapshots + predictions.
- `GET /artifacts/*` – streamed artifact files (with path whitelist).
- `GET /heartbeat` – SSE stream combining latest block digest, mempool feed, prediction (5s cadence).

Implementation notes:

- Reuse existing helpers in `dashboard/lib` by moving shared logic into `packages/server` or exposing them via the API server with `ts-node` build.
- Gate artifact serving to prevent path traversal; rely on `DATA_DIR` base.
- Provide `?since=` filter for SSE to support reconnection without missing events.

---

## 3. Environment Variables

| Variable | Description | Applies To |
| --- | --- | --- |
| `DATA_DIR` | Absolute path to mounted artifacts directory. | API, workers |
| `DATABASE_PATH` | Optional override for SQLite DB. Default: `$DATA_DIR/index.db`. | API |
| `DATA_API_URL` | Base URL for the Render API (used by Next.js server components). | Vercel frontend |
| `STREAM_CHAINS`, `STREAM_BATCH_SIZE`, `STREAM_INTERVAL_MS` | Control watchIngest cadence. | Ingestion worker |
| `STREAM_ATLAS_INTERVAL_MS` | Frequency for atlas refresh within watcher. | Ingestion worker |
| `ETH_RPC_URLS`, `AVAX_RPC_URLS`, `SOLANA_RPC_URLS` | Comma-separated RPC endpoints. | Ingestion, mempool |
| `HALO2_VERIFIER_BIN`, `HALO2_VK_PATH`, `HALO2_TIMEOUT_MS` | Proof verification config. | API (if verifying), ingestion |
| `NGROK_AUTHTOKEN` | Optional for local dev; not used in cloud. | Local only |
| `NEXT_PUBLIC_DATA_API_URL` | Base URL for backend API (e.g., `https://yysfold-api.onrender.com`). | Vercel frontend (client) |
| `SSE_HEARTBEAT_INTERVAL_MS` | Optional knob for `/heartbeat`. | API |
| `PREDICTION_MIN_CONFIDENCE` | Threshold for showing predictions. | API |

Store secrets in Render/Vercel dashboards; never bake into repo.

---

## 4. Dockerization

Each Render service receives its own Dockerfile to keep dependencies minimal.

### API Service (`Dockerfile.api`)
```
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json tsconfig.json ./
COPY dashboard/package*.json dashboard/
RUN npm ci && cd dashboard && npm ci

FROM deps AS build
COPY . .
RUN npm run build && cd dashboard && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
CMD ["node", "dist/api/server.js"]
```

### Ingestion Worker (`Dockerfile.ingest`)
Same base layers as the API image, but the build stage only runs `npm run build` (no Next.js build) and the runner launches `node dist/scripts/watchIngest.js`. The final stage declares a persistent volume at `/data` and exports `DATA_DIR=/data`.

### Mempool Worker (`Dockerfile.mempool`)
Identical to the ingestion worker except the entrypoint is `node dist/scripts/mempoolWatch.js`.

All Dockerfiles respect the shared `.dockerignore`, which removes `node_modules`, `.next`, local artifacts, and git metadata so Render build contexts stay small. When provisioning the services, attach a Render disk at `/data` and set `DATA_DIR=/data` for anything that needs to read/write the artifact store.

---

## 5. Render Configuration

1. **Persistent Disk**: Create a 20–50 GB disk. Mount at `/data` for API + workers.
2. **Web Service (API)**:
   - Repo: GitHub `psyberchaser/yysfolding`.
   - Dockerfile path: `Dockerfile.api`.
   - Start command: default (in Docker CMD).
   - Env vars: `DATA_DIR=/data`, RPC secrets, etc.
3. **Background Workers**:
   - Worker 1: ingestion (`Dockerfile.ingest`).
   - Worker 2: mempool (`Dockerfile.mempool`).
   - Attach same disk; mark as `read-write` (Render supports shared mount; if conflicts arise, designate ingestion as RW and API as RO with periodic sync).
4. **Optional Cron Job**: Render cron calling `node dist/scripts/buildAtlas.js` daily.
5. **Networking**: Ensure API service exposes port 8080; configure health checks.

---

## 6. Vercel Deployment

1. Import GitHub repo into Vercel.
2. Configure project root as `dashboard/`.
3. Set build command `npm install && npm run build`.
4. Set env vars:
   - `DATA_API_URL=https://<render-service>.onrender.com`.
   - `NEXT_PUBLIC_DATA_API_URL=https://<render-service>.onrender.com`.
   - Any gating flags for client features.
5. Optionally set preview URLs to a staging API.
6. After deployment, verify that SSE connects to Render endpoint (CORS + streaming).

---

## 7. Migration Steps

1. Implement API server + shared data module.
2. Update dashboard data loaders to fetch from API when `NEXT_PUBLIC_DATA_API_URL` is set (fallback to local FS).
3. Add Dockerfiles, Procfiles/scripts.
4. Test locally:
   - `DATA_DIR=$(pwd)/artifacts node dist/api/server.js`.
   - `NEXT_PUBLIC_DATA_API_URL=http://localhost:8080 npm run dev` in `/dashboard`.
5. Push to GitHub, trigger Render/Vercel builds.
6. Validate end-to-end: ingestion writes to disk → API surfaces data → Vercel dashboard renders + SSE updates.

---

## 8. Open Questions / TODO

- Do we migrate SQLite to a managed DB (Render PostgreSQL) for multi-writer safety? Initial plan keeps `better-sqlite3` on disk.
- Need quota monitoring for RPC endpoints; consider Alchemy/QuickNode accounts.
- Confirm SSE performance on Render free tier; may require paid plan for sustained connections.
- Evaluate artifact sync to S3 for durability once traffic increases.

This plan will be kept up-to-date as we implement each step.

