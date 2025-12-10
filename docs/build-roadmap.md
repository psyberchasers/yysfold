# YYSFold Build Roadmap

## Current State Assessment

### What's Complete ✅

| Feature | Status | Notes |
|---------|--------|-------|
| Vectorization | ✅ Done | 16-dim tx, 12-dim state, 8-dim witness vectors |
| Folding | ✅ Done | Mean, variance, component matrix aggregation |
| PQ Encoding | ✅ Done | Codebook lookup + residual computation |
| Learned Codebook | ✅ Done | K-means training on historical vectors |
| KDE Hotzones | ✅ Done | Gaussian kernel density estimation |
| Hypergraph | ✅ Done | Pairwise, triple, quad edge construction |
| Rule-based Tags | ✅ Done | DEX/NFT/LENDING/BRIDGE via contracts + selectors |
| BLAKE3 Commitments | ✅ Done | Cryptographic hashing |
| Multi-chain Ingestion | ✅ Done | ETH, AVAX, SOL blocks |
| Mempool Watch | ✅ Done | ETH, AVAX pending transactions |
| Dashboard | ✅ Done | Real-time SSE, visualizations, filtering |
| Basic Predictions | ⚠️ Rule-based | Trend extrapolation (gas, tx count) |
| Anomaly Scoring | ⚠️ Heuristic | Hand-tuned weights, not learned |
| Halo2 Circuit | ⚠️ Skeleton | Proves commitment equality, not full pipeline |

### What Needs Building ❌

| Feature | Status | Effort | Priority |
|---------|--------|--------|----------|
| Isolation Forest Anomaly | ❌ Missing | 1-2 days | P1 |
| Drift Velocity Signal | ❌ Missing | 2-3 days | P1 |
| Hotzone Departure Signal | ❌ Missing | 1-2 days | P1 |
| Tag Acceleration | ❌ Missing | 2-3 days | P2 |
| Cross-Chain Correlation | ❌ Missing | 3-5 days | P2 |
| LSTM Sequence Predictor | ❌ Missing | 1-2 weeks | P3 |
| Vector Database (similarity search) | ❌ Missing | 1 week | P3 |
| Neural Tag Classifier | ❌ Missing | 1 week | P4 |
| Full Halo2 Circuit | ⚠️ Incomplete | 1-2 weeks | P4 |
| GNN on Hypergraph | ❌ Missing | 2-4 weeks | P5 |

---

## Timeline Estimates

### Phase 1: Core Differentiating Signals (1-2 weeks)
Quick wins that create unique value immediately.

| Task | Days | Description |
|------|------|-------------|
| Isolation Forest | 2 | Python sklearn + TypeScript bridge for learned anomaly detection |
| Drift Velocity | 2 | Rolling window distance calculation on fingerprint sequences |
| Hotzone Departure | 1 | Distance-to-nearest-centroid threshold signal |
| Tag Acceleration | 2 | Second derivative of tag frequency over time |
| **Phase 1 Total** | **7 days** | |

### Phase 2: Cross-Chain Intelligence (1 week)
Unique multi-chain signals.

| Task | Days | Description |
|------|------|-------------|
| Lead/Lag Detection | 3 | Time-lagged correlation between chain fingerprints |
| Divergence Detection | 2 | Distance metric when correlated chains diverge |
| **Phase 2 Total** | **5 days** | |

### Phase 3: Predictive Models (2-3 weeks)
ML-powered forecasting.

| Task | Days | Description |
|------|------|-------------|
| LSTM Predictor | 10 | Sequence model for fingerprint + tag prediction |
| Vector Database | 5 | Historical pattern matching via similarity search |
| **Phase 3 Total** | **15 days** | |

### Phase 4: Advanced Features (3-4 weeks)
Full platform capabilities.

| Task | Days | Description |
|------|------|-------------|
| Neural Tag Classifier | 5 | Replace threshold tags with learned classifier |
| Full Halo2 Circuit | 10 | Prove complete folding pipeline |
| GNN Hypergraph | 15 | Learned structural patterns |
| **Phase 4 Total** | **30 days** | |

---

## Total Timeline

| Phase | Duration | Cumulative |
|-------|----------|------------|
| Phase 1 | 1-2 weeks | 1-2 weeks |
| Phase 2 | 1 week | 2-3 weeks |
| Phase 3 | 2-3 weeks | 4-6 weeks |
| Phase 4 | 3-4 weeks | 7-10 weeks |

**Minimum viable differentiating signals: 2-3 weeks (Phase 1 + 2)**
**Full ML stack: 7-10 weeks**

---

## Launch Strategy Options

### Option A: Launch Now, Build Live
**Put current system online immediately, add features incrementally.**

Pros:
- Get user feedback early
- Show momentum to partners
- Real data validates approach
- Can demonstrate core concept (fingerprinting works)

Cons:
- Missing the "wow" signals (predictions, cross-chain correlation)
- Dashboard shows basic anomaly scores, not learned ones
- Partner pitch harder without ML differentiation

**What you can show NOW:**
- Real-time multi-chain fingerprinting
- KDE hotzones and hypergraph visualization
- Rule-based tags and predictions
- ZK commitment infrastructure (not full proofs)

### Option B: Build Phase 1+2 First (2-3 weeks)
**Launch with core differentiating signals.**

Pros:
- Have unique signals to demonstrate (drift velocity, hotzone departure, cross-chain)
- Isolation Forest gives credible "learned" anomaly detection
- Much stronger partner pitch

Cons:
- 2-3 week delay
- Still missing LSTM predictions

**What you can show AFTER Phase 1+2:**
- Everything in Option A, PLUS:
- Learned anomaly detection (Isolation Forest)
- Fingerprint drift velocity (unique signal)
- Hotzone departure detection (regime change)
- Tag acceleration (semantic velocity)
- Cross-chain lead/lag correlation (unique signal)

### Option C: Build Through Phase 3 (5-6 weeks)
**Launch with full predictive capabilities.**

Pros:
- LSTM predictions with confidence intervals
- Historical pattern matching ("we've seen this before")
- Complete unique signal suite

Cons:
- 5-6 week delay
- Risk of scope creep

---

## Recommendation

**Option B is the sweet spot.**

Rationale:
1. Current system proves the architecture works but lacks differentiating signals
2. Phase 1+2 takes only 2-3 weeks and adds the "unique" signals that matter
3. Isolation Forest + Drift Velocity + Cross-Chain = strong pitch
4. Can launch, get feedback, and build Phase 3 while live

### Suggested Order Within Phase 1+2

```
Week 1:
- Day 1-2: Isolation Forest (Python script + integration)
- Day 3-4: Drift Velocity calculation
- Day 5: Hotzone Departure signal

Week 2:
- Day 1-2: Tag Acceleration
- Day 3-5: Cross-Chain Lead/Lag Correlation

Week 3 (buffer/polish):
- Integration testing
- Dashboard updates for new signals
- Documentation
```

Then launch and build Phase 3 (LSTM, vector database) while live.

---

## What "Launch" Means

### Minimum for Launch
- [ ] Render deployment stable (backend API + ingestion workers)
- [ ] Vercel deployment stable (dashboard)
- [ ] Heartbeat/SSE working reliably
- [ ] At least 24 hours of ingested data for each chain
- [ ] Phase 1+2 signals integrated into dashboard

### Nice to Have for Launch
- [ ] API documentation
- [ ] Rate limiting on public endpoints
- [ ] Basic authentication for partner access
- [ ] WebSocket feed (in addition to SSE)

### Can Add After Launch
- [ ] LSTM predictions
- [ ] Historical pattern matching
- [ ] Full ZK proofs
- [ ] GNN analysis

