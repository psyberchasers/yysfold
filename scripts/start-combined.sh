#!/bin/sh
# Start both API server and ingestion in one container

echo "[start] Starting combined API + Ingestion..."

# Start ingestion in background (with delay to let API bind port first)
(sleep 10 && echo "[start] Starting ingestion..." && node dist/scripts/watchIngest.js) &

# Start API server in foreground
echo "[start] Starting API server..."
exec node dist/api/server.js

