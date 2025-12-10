# YYSFold System Walkthrough

## What Is This?

YYSFold is a **blockchain behavioral fingerprinting system**. It watches blockchain activity in real-time, compresses each block into a compact "fingerprint," identifies unusual patterns (hotzones), and can predict what the next block might look like — all while generating cryptographic proofs that the analysis was done correctly.

**Live URL:** https://yysfold.ngrok.io

---

## Dashboard Overview (Top to Bottom)

### 1. Header & Navigation
```
┌─────────────────────────────────────────────────────────┐
│  YYSFold                              [Atlas] [Chat]    │
└─────────────────────────────────────────────────────────┘
```
- **YYSFold logo** — links to home
- **Atlas** — 2D/3D visualization of the vector space
- **Chat** — AI assistant for querying block data

---

### 2. Latest Block Fingerprint Card

```
┌─────────────────────────────────────────────────────────┐
│  Latest behavioral fingerprint                          │
│                                                         │
│  sol · #383106448                     [Live] Updated 7s │
│  Nov 28, 08:33                                          │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ASSET  SOLANA PROGRAM  HIGH THROUGHPUT          │   │
│  │ MIXED ACTIVITY  BRIDGE ACTIVITY                 │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Block hash: EyU8uUGPYrKC8NZk...                       │
│  Artifacts: [raw block] [proof]                         │
│                                                         │
│  Regime: Bridge Activity + Lending Activity             │
│  Anomaly: 0.37 (Typical)                               │
│  Density: 1058183.24 · PQ: 6.279 · Tags: 5             │
└─────────────────────────────────────────────────────────┘
```

**What each element means:**

| Element | Description |
|---------|-------------|
| **sol · #383106448** | Chain (Solana) and block height |
| **[Live]** | Real-time SSE connection active |
| **Updated 7s** | Time since last heartbeat |
| **Tags (pills)** | Semantic behaviors detected in this block |
| **Block hash** | Truncated block identifier |
| **[raw block]** | Link to download the raw block JSON |
| **[proof]** | Link to the ZK proof artifact |
| **Regime** | Dominant behavioral pattern combination |
| **Anomaly: 0.37** | Score from 0-1 (higher = more unusual) |
| **Density** | Peak hotzone density (KDE value) |
| **PQ** | Average PQ reconstruction error |
| **Tags** | Count of semantic tags |

**Anomaly Labels:**
- **Typical** (< 0.45) — Normal activity
- **Unusual** (0.45 - 0.75) — Notable patterns
- **Rare** (> 0.75) — Potential anomaly

---

### 3. Predicted Next Block Card

```
┌─────────────────────────────────────────────────────────┐
│  Predicted next block                                   │
│                                                         │
│  SOL   24% confidence                                   │
│  MIXED ACTIVITY                                         │
│  ETA ~10s · 9:10:41 AM                                 │
│                                                         │
│  • Steady state                                         │
└─────────────────────────────────────────────────────────┘
```

**What this shows:**
- **Chain** being predicted (SOL, ETH, AVAX)
- **Confidence** — How sure we are (based on trend stability)
- **Predicted tags** — What behaviors we expect
- **ETA** — Estimated time until next block
- **Reasons** — Why we made this prediction

**How predictions work:**
1. We keep a rolling history of recent mempool snapshots
2. We compute trends: gas slope, transaction delta, tag frequency changes
3. If trends are stable → MIXED_ACTIVITY with low confidence
4. If gas spiking + DEX activity → HIGH_FEE + DEX_ACTIVITY with higher confidence

---

### 4. Mempool Ticker (Live Feed)

```
┌─────────────────────────────────────────────────────────┐
│  Live Mempool                                           │
│                                                         │
│  08:33:12  ETH  ▲ High     142 txs · 45 gwei · 2.1 ETH │
│            │    DEX surge, gas climbing                 │
│                                                         │
│  08:33:08  SOL  ● Normal   89 txs · 0.00025 SOL        │
│            │    Steady state                            │
│                                                         │
│  08:33:02  AVAX ▼ Low      23 txs · 28 nAVAX           │
│            │    Light activity                          │
└─────────────────────────────────────────────────────────┘
```

**What this shows:**
- **Timestamp** — When the snapshot was taken
- **Chain** — Which blockchain
- **Pressure indicator** — ▲ High / ● Normal / ▼ Low
- **Stats** — Pending transaction count, gas price, total value
- **Highlights** — Notable patterns detected

**This is NOT showing confirmed blocks** — it's showing the **mempool** (pending transactions waiting to be included).

---

### 5. Block Detail Page

When you click on a block, you see:

```
┌─────────────────────────────────────────────────────────┐
│  Block sol #383106448                                   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Hotzones                                        │   │
│  │  ┌─────┐ ┌─────┐ ┌─────┐                        │   │
│  │  │ Hz1 │ │ Hz2 │ │ Hz3 │  ... (up to 16)       │   │
│  │  └─────┘ └─────┘ └─────┘                        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Hypergraph Visualization                               │
│  [3D force-directed graph of hotzone relationships]     │
│                                                         │
│  Metrics                                                │
│  • Transactions: 1,247                                  │
│  • Folded vectors: 6                                    │
│  • PQ residual p95: 0.183                              │
│  • Commitment: 0x8a7f3c...                             │
└─────────────────────────────────────────────────────────┘
```

**Hotzones** are regions of high-density activity in the compressed vector space. Each hotzone represents a cluster of similar transaction behaviors.

---

### 6. Atlas Page

```
┌─────────────────────────────────────────────────────────┐
│  Atlas                                    [2D] [3D]     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                    ●                             │   │
│  │         ●              ●                         │   │
│  │    ●         ●    ●         ●                   │   │
│  │              ●                    ●              │   │
│  │       ●           ●       ●                     │   │
│  │                        ●                         │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Each dot = a hotzone from recent blocks                │
│  Connections = hyperedges (related hotzones)            │
│  Size = density · Color = semantic tag                  │
└─────────────────────────────────────────────────────────┘
```

The Atlas shows **all hotzones from recent blocks** projected into 2D or 3D space. This lets you see:
- Clusters of similar behavioral patterns
- How current activity compares to historical norms
- Outliers that don't fit normal patterns

---

## The Pipeline (What Happens Behind the Scenes)

### Step 1: Block Ingestion

```
RPC Node → watchIngest.js → Raw Block JSON
```

The **ingestion worker** polls blockchain RPC endpoints every few seconds:
- **Ethereum** — via ETH_RPC_URLS
- **Solana** — via Solana RPC
- **Avalanche** — via AVAX RPC

For each new block, it downloads:
- Block header (height, timestamp, hash)
- All transactions
- Execution traces (if available)
- State changes

---

### Step 2: Vectorization

```
Raw Block → vectorizeBlock() → Vectors
```

Each transaction becomes a **16-dimensional vector**:

```
Transaction {amount, fee, gas, ...} 
    ↓
Vector [0.72, 0.15, 0.33, 0.5, 0.001, ...]
```

**What gets encoded:**
- Normalized amounts (0-1 scale)
- Fee levels
- Gas usage
- Contract type (hashed to bucket)
- Asset/token (hashed)
- Sender/receiver patterns
- Timestamp position in day

---

### Step 3: Folding

```
[1000+ vectors] → foldVectors() → [6 vectors]
```

We compress all transaction vectors into just **6 summary vectors**:

1. **Mean vector** — Average of all transactions
2. **Variance vector** — How spread out the values are
3. **Component 1-4** — Principal directions of variation

This reduces a block with 1000 transactions from ~16,000 numbers to just 96 numbers.

---

### Step 4: Product Quantization (PQ)

```
[6 vectors] → pqEncode() → [6 codes] + residuals
```

Each folded vector is further compressed using a **codebook**:

```
Vector [0.72, 0.15, 0.33, 0.5] 
    ↓
Split into 4 subvectors
    ↓
Find nearest centroid for each
    ↓
Code: [142, 87, 203, 56]  (4 bytes instead of 16 floats)
```

The **residual** is how much error this compression introduces. We track this to ensure quality.

---

### Step 5: Hotzone Detection (KDE)

```
PQ codes → pqDecode() → Vectors → KDE → Hotzones
```

We reconstruct the vectors and run **Kernel Density Estimation**:

```
For each vector:
    density = sum of Gaussian kernels from all other vectors
    
If density > threshold:
    This is a HOTZONE (cluster of similar activity)
```

Hotzones get **semantic tags** based on which vector components are high:
- High component 0 → HIGH_VALUE
- High component 2 → DEX_ACTIVITY
- High component 7 → AML_ALERT
- etc.

---

### Step 6: Hypergraph Construction

```
Hotzones → buildHypergraph() → Graph
```

We connect hotzones that are:
- Close in vector space (small distance)
- Both high density

This creates a **graph structure** showing relationships between behavioral clusters.

---

### Step 7: Anomaly Scoring

```
(density, residuals, tags) → computeAnomalyScore() → 0.37
```

The anomaly score combines three signals:

| Component | Weight | What it measures |
|-----------|--------|------------------|
| Density | 50% | How concentrated activity is |
| Residuals | 35% | How well PQ compression fits |
| Tags | 15% | Presence of suspicious tags |

---

### Step 8: Cryptographic Commitment

```
Fingerprint → BLAKE3 hash → Commitment
```

We hash everything to create tamper-proof commitments:
- **Folded commitment** — Hash of the 6 folded vectors
- **PQ commitment** — Hash of the PQ codes
- **Codebook root** — Hash of the compression codebook

These go into the ZK proof.

---

### Step 9: ZK Proof Generation (Optional)

```
Witness + Public Inputs → Halo2 Prover → Proof
```

If Halo2 is configured, we generate a zero-knowledge proof that:
1. The vectorization was done correctly
2. The folding math is right
3. The PQ encoding respects the error bound
4. The commitments match

**Currently:** Running mock proofs (placeholder). Real proofs require compiled Halo2 binaries.

---

### Step 10: Storage & Display

```
Summary + Proof → SQLite + JSON files → Dashboard
```

Everything is saved to:
- **SQLite database** — For queries (by chain, tag, time)
- **JSON files** — Raw artifacts in `/artifacts/`

The dashboard reads from these to display the fingerprints.

---

## Services Running

### Local (via ngrok)

| Service | Port | Purpose |
|---------|------|---------|
| Next.js Dashboard | 3000 | Web UI |
| ngrok tunnel | — | Public URL (yysfold.ngrok.io) |
| Ingest Worker | — | Background: fetches blocks |
| Mempool Worker | — | Background: watches pending txs |

### Cloud (Render + Vercel)

| Service | Platform | Purpose |
|---------|----------|---------|
| API | Render | Serves data to frontend |
| Ingest Worker | Render | Background block ingestion |
| Mempool Worker | Render | Background mempool watching |
| Dashboard | Vercel | Static Next.js frontend |

---

## Key Files

| File | Purpose |
|------|---------|
| `scripts/ingestBlocks.ts` | Main ingestion pipeline |
| `scripts/mempoolWatch.ts` | Mempool polling + predictions |
| `folding/vectorize.ts` | Transaction → Vector |
| `folding/fold.ts` | Vectors → Folded Block |
| `folding/pq.ts` | Product Quantization |
| `analytics/hotzones.ts` | KDE + hotzone detection |
| `analytics/hypergraph.ts` | Graph construction |
| `zk/halo2Backend.ts` | ZK proof interface |
| `dashboard/app/page.tsx` | Main dashboard page |

---

## Quick Explanation Script

> "YYSFold takes raw blockchain blocks and compresses them into behavioral fingerprints. Each block with thousands of transactions gets reduced to just 6 summary vectors using statistical folding and product quantization. 
>
> We then run kernel density estimation to find 'hotzones' — clusters of similar transaction patterns — and tag them semantically (DEX activity, bridge transfers, potential AML alerts, etc.).
>
> The anomaly score tells us if a block looks normal or unusual compared to baseline. The mempool feed shows pending transactions in real-time, and we use trend analysis to predict what the next block might look like.
>
> Everything is cryptographically committed with BLAKE3 hashes, and we can optionally generate zero-knowledge proofs that the analysis was done correctly — so you can verify the fingerprint without re-running all the math yourself."

---

## Glossary

| Term | Definition |
|------|------------|
| **Fingerprint** | Compact representation of a block's behavior |
| **Folding** | Compressing many vectors into few summary vectors |
| **PQ (Product Quantization)** | Vector compression using a codebook |
| **KDE** | Kernel Density Estimation — finding dense regions |
| **Hotzone** | A cluster of similar transactions |
| **Hypergraph** | Graph where edges can connect 2+ nodes |
| **Anomaly Score** | 0-1 measure of how unusual a block is |
| **Mempool** | Pool of pending (unconfirmed) transactions |
| **ZK Proof** | Cryptographic proof of correct computation |
| **Commitment** | Hash that binds data without revealing it |





