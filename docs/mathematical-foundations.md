# YYSFold: Mathematical Foundations

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Vectorization Layer](#2-vectorization-layer)
3. [Folding Operator](#3-folding-operator)
4. [Product Quantization (PQ)](#4-product-quantization-pq)
5. [Kernel Density Estimation & Hotzones](#5-kernel-density-estimation--hotzones)
6. [Hypergraph Construction](#6-hypergraph-construction)
7. [Anomaly Scoring](#7-anomaly-scoring)
8. [Cryptographic Commitments](#8-cryptographic-commitments)
9. [Zero-Knowledge Proof System](#9-zero-knowledge-proof-system)
10. [Atlas Visualization](#10-atlas-visualization)

---

## 1. System Overview

YYSFold is a blockchain fingerprinting system that compresses high-dimensional transaction data into compact, semantically meaningful representations while preserving cryptographic verifiability through zero-knowledge proofs.

### Pipeline Architecture

```
Raw Block → Vectorization → Folding → PQ Encoding → Commitment
                                          ↓
                                    KDE Analysis → Hotzones → Hypergraph
                                          ↓
                                    Anomaly Score → Semantic Tags
```

**Key Mathematical Properties:**
- **Dimensionality Reduction:** From \(O(n \cdot d_{tx})\) to fixed \(k \cdot d_{fold}\) vectors
- **Lossy Compression:** Bounded reconstruction error \(\varepsilon\)
- **Density Preservation:** Local structure maintained via KDE
- **Cryptographic Binding:** BLAKE3 commitments link all transformations

---

## 2. Vectorization Layer

### 2.1 Transaction Vectorization

Each transaction \(tx_i\) is mapped to a fixed-dimensional vector \(\mathbf{x}_i \in \mathbb{R}^{d_{tx}}\) where \(d_{tx} = 16\):

$$\mathbf{x}_i = \phi_{tx}(tx_i) = \begin{pmatrix} \nu(\text{amount}, M_{\text{amt}}) \\ \nu(\text{fee}, M_{\text{fee}}) \\ \nu(\text{gasUsed}, M_{\text{gas}}) \\ \nu(\text{index}, n) \\ \nu(\text{height}, 10^7) \\ \tau(\text{timestamp}) \\ h(\text{type}, 64) \\ h(\text{asset}, 256) \\ \vdots \end{pmatrix}$$

### 2.2 Normalization Functions

**Linear Normalization:**
$$\nu(v, M) = \text{clamp}\left(\frac{v}{M}, -1, 1\right)$$

**Index Normalization:**
$$\nu_{\text{idx}}(i, n) = \begin{cases} 0 & \text{if } n \leq 1 \\ \frac{i}{n-1} & \text{otherwise} \end{cases}$$

**Timestamp Normalization (Cyclic):**
$$\tau(t) = \frac{t \mod (10 \cdot s)}{10 \cdot s}, \quad s = 86400 \text{ (seconds/day)}$$

**Hash Bucketing:**
$$h(v, B) = \frac{\text{hash}(v) \mod B}{B - 1}$$

where hash uses the polynomial rolling hash:
$$\text{hash}(s) = \sum_{i=0}^{|s|-1} s[i] \cdot 31^i \mod 2^{32}$$

### 2.3 State and Witness Vectors

**State Vector** \(\mathbf{s}_j \in \mathbb{R}^{12}\):
$$\mathbf{s}_j = \phi_{\text{state}}(\text{trace}_j) = \begin{pmatrix} \nu_{\text{idx}}(j, |\text{traces}|) \\ \nu(\Delta\text{balance}, M_{\text{amt}}) \\ \nu(\text{storageWrites}, 1024) \\ \vdots \end{pmatrix}$$

**Witness Vector** \(\mathbf{w}_k \in \mathbb{R}^{8}\):
$$\mathbf{w}_k = \phi_{\text{witness}}(\text{bundle}_k)$$

---

## 3. Folding Operator

### 3.1 Vector Collection

Collect all vectors from a block:
$$\mathcal{V} = \{\mathbf{x}_1, \ldots, \mathbf{x}_{n_{tx}}\} \cup \{\mathbf{s}_1, \ldots, \mathbf{s}_{n_s}\} \cup \{\mathbf{w}_1, \ldots, \mathbf{w}_{n_w}\}$$

Resize each to canonical dimension \(d = 16\):
$$\tilde{\mathbf{v}}_i = \text{resize}(\mathbf{v}_i, d) \in \mathbb{R}^d$$

### 3.2 Statistical Aggregation

**Mean Vector:**
$$\boldsymbol{\mu} = \frac{1}{|\mathcal{V}|} \sum_{i=1}^{|\mathcal{V}|} \tilde{\mathbf{v}}_i$$

**Standard Deviation Vector:**
$$\boldsymbol{\sigma}_j = \sqrt{\frac{1}{|\mathcal{V}| - 1} \sum_{i=1}^{|\mathcal{V}|} (\tilde{v}_{i,j} - \mu_j)^2}$$

### 3.3 Component Projection

Apply a fixed projection matrix \(\mathbf{W} \in \mathbb{R}^{k \times d}\) with \(k = 4\) principal directions:

$$\mathbf{c}_m = \frac{1}{|\mathcal{V}|} \sum_{i=1}^{|\mathcal{V}|} \tilde{\mathbf{v}}_i \odot \mathbf{w}_m$$

where \(\mathbf{w}_m\) is row \(m\) of the component matrix.

**Unit Normalization:**
$$\hat{\mathbf{c}}_m = \frac{\mathbf{c}_m}{\|\mathbf{c}_m\|_2 + \epsilon}, \quad \epsilon = 10^{-6}$$

### 3.4 Final Folded Block

The folded block consists of \(k + 2 = 6\) vectors:
$$F_B = \{\boldsymbol{\mu}, \boldsymbol{\sigma}, \hat{\mathbf{c}}_1, \hat{\mathbf{c}}_2, \hat{\mathbf{c}}_3, \hat{\mathbf{c}}_4\}$$

---

## 4. Product Quantization (PQ)

### 4.1 Codebook Structure

A PQ codebook \(\mathcal{C}\) partitions \(\mathbb{R}^d\) into \(m\) subspaces, each with \(K\) centroids:

$$\mathcal{C} = \{C^{(1)}, C^{(2)}, \ldots, C^{(m)}\}$$

where each \(C^{(s)} = \{\mathbf{c}^{(s)}_1, \ldots, \mathbf{c}^{(s)}_K\} \subset \mathbb{R}^{d/m}\)

**Default Parameters:**
- \(m = 4\) subspaces
- \(K = 256\) centroids per subspace
- \(d/m = 4\) subvector dimension

### 4.2 Encoding

For a folded vector \(\mathbf{f} \in \mathbb{R}^d\):

1. **Split into subvectors:**
   $$\mathbf{f} = [\mathbf{f}^{(1)} | \mathbf{f}^{(2)} | \cdots | \mathbf{f}^{(m)}]$$

2. **Find nearest centroid per subspace:**
   $$q_s = \arg\min_{k \in [K]} \|\mathbf{f}^{(s)} - \mathbf{c}^{(s)}_k\|_2$$

3. **PQ code:**
   $$\text{PQ}(\mathbf{f}) = (q_1, q_2, \ldots, q_m) \in [K]^m$$

### 4.3 Reconstruction and Residuals

**Reconstruction:**
$$\hat{\mathbf{f}} = [\mathbf{c}^{(1)}_{q_1} | \mathbf{c}^{(2)}_{q_2} | \cdots | \mathbf{c}^{(m)}_{q_m}]$$

**Reconstruction Error (Residual):**
$$r(\mathbf{f}) = \|\mathbf{f} - \hat{\mathbf{f}}\|_2$$

**Error Bound Constraint:**
$$r(\mathbf{f}) \leq \varepsilon, \quad \varepsilon = 0.25 \text{ (default)}$$

### 4.4 Residual Statistics

For a block with residuals \(\{r_1, \ldots, r_n\}\):

- **Average:** \(\bar{r} = \frac{1}{n}\sum_i r_i\)
- **Maximum:** \(r_{\max} = \max_i r_i\)
- **95th Percentile:** \(r_{95} = \text{percentile}(\{r_i\}, 0.95)\)

---

## 5. Kernel Density Estimation & Hotzones

### 5.1 Gaussian Kernel

The Gaussian (radial basis function) kernel:
$$K(\mathbf{x}, \mathbf{y}; h) = \exp\left(-\frac{\|\mathbf{x} - \mathbf{y}\|_2^2}{2h^2}\right)$$

where \(h = 0.15\) is the bandwidth parameter.

### 5.2 Kernel Density Estimator

For decoded PQ vectors \(\{\hat{\mathbf{f}}_1, \ldots, \hat{\mathbf{f}}_n\}\), the density at point \(\mathbf{x}\):

$$\hat{p}(\mathbf{x}) = \frac{1}{n \cdot (h\sqrt{2\pi})^d} \sum_{i=1}^{n} K(\mathbf{x}, \hat{\mathbf{f}}_i; h)$$

### 5.3 Hotzone Detection

1. **Compute density at each decoded vector:**
   $$\rho_i = \hat{p}(\hat{\mathbf{f}}_i)$$

2. **Threshold filtering:**
   $$\mathcal{H}_{\text{candidates}} = \{i : \rho_i \geq \theta\}, \quad \theta = 0.02$$

3. **Select top-\(k\) by density:**
   $$\mathcal{H} = \text{top}_k(\mathcal{H}_{\text{candidates}}, \rho), \quad k = 16$$

4. **Hotzone output:**
   $$\text{Hotzone}_j = \left(\hat{\mathbf{f}}_j, \rho_j, r = 2h, \text{tags}_j\right)$$

### 5.4 Semantic Tag Derivation

Tags are derived from vector component thresholds:

| Index | Threshold | Tag |
|-------|-----------|-----|
| 0 | > 0.65 | HIGH_VALUE |
| 1 | > 0.55 | FEE_INTENSIVE |
| 2 | > 0.55 | DEX_ACTIVITY |
| 3 | > 0.55 | NFT_ACTIVITY |
| 4 | > 0.45 | BRIDGE_ACTIVITY |
| 5 | > 0.50 | TIME_CLUSTER |
| 6 | > 0.50 | LENDING_ACTIVITY |
| 7 | > 0.50 | AML_ALERT |
| 8 | > 0.55 | MEV_ACTIVITY |
| 9 | < -0.45 | VOLATILITY_CRUSH |

---

## 6. Hypergraph Construction

### 6.1 Pairwise Weight Function

For hotzones \(H_a\) and \(H_b\):

$$w(H_a, H_b) = \max(0, r_a + r_b - d_{ab}) \cdot \sqrt{\rho_a \cdot \rho_b}$$

where:
- \(d_{ab} = \|\mathbf{c}_a - \mathbf{c}_b\|_2\) is the center distance
- \(r_a, r_b\) are the radii
- \(\rho_a, \rho_b\) are the densities

### 6.2 Hyperedge Formation

**2-edges (pairs):**
$$E_2 = \{(i, j) : w(H_i, H_j) \geq \theta_2\}, \quad \theta_2 = 5 \times 10^{-5}$$

**3-edges (triples):**
$$E_3 = \{(i, j, k) : \bar{w}_{ijk} \geq 1.5\theta_2\}$$
$$\bar{w}_{ijk} = \frac{w(H_i, H_j) + w(H_j, H_k) + w(H_i, H_k)}{3}$$

**4-edges (quadruples):**
$$E_4 = \{(a, b, c, d) : \bar{w}_{abcd} \geq 2\theta_2\}$$
$$\bar{w}_{abcd} = \frac{1}{6}\sum_{\{p,q\} \subseteq \{a,b,c,d\}} w(H_p, H_q)$$

### 6.3 Hypergraph Output

$$\mathcal{G} = (\mathcal{H}, E_2 \cup E_3 \cup E_4)$$

---

## 7. Anomaly Scoring

### 7.1 Component Scores

**Density Component:**
$$S_{\text{density}} = 1 - \min\left(1, \frac{\max_j \rho_j}{\rho_{\text{baseline}}}\right)$$
where \(\rho_{\text{baseline}} = 1.1 \times 10^6\)

**Residual Component:**
$$S_{\text{residual}} = \min\left(1, \frac{r_{95}}{0.5}\right)$$

**Tag Component:**
$$S_{\text{tags}} = \min\left(1, \frac{\sum_{t \in \text{tags}} \pi(t)}{3}\right)$$

where \(\pi(t)\) is the prior weight for tag \(t\):

| Tag | Prior Weight |
|-----|--------------|
| AML_ALERT | 0.8 |
| AML_RULE | 0.7 |
| HIGH_FEE | 0.6 |
| VOL_CRUSH | 0.5 |
| BRIDGE_ACTIVITY | 0.45 |
| LENDING_ACTIVITY | 0.4 |
| NFT_ACTIVITY | 0.35 |
| DEX_ACTIVITY | 0.3 |

### 7.2 Final Anomaly Score

$$S = 0.50 \cdot S_{\text{density}} + 0.35 \cdot S_{\text{residual}} + 0.15 \cdot S_{\text{tags}}$$

$$S \in [0, 1], \quad \text{clamped}$$

**Labels:**
- \(S \geq 0.75\): **Rare**
- \(0.45 \leq S < 0.75\): **Unusual**
- \(S < 0.45\): **Typical**

---

## 8. Cryptographic Commitments

### 8.1 BLAKE3 Hash

All commitments use BLAKE3:
$$H: \{0,1\}^* \to \{0,1\}^{256}$$

### 8.2 Folded Block Commitment

$$C_{\text{fold}} = H(\text{JSON}(F_B))$$

### 8.3 PQ Code Commitment

$$C_{\text{PQ}} = H(\text{JSON}(\{(q_1^{(i)}, \ldots, q_m^{(i)})\}_{i=1}^{|F_B|}))$$

### 8.4 Codebook Root

$$C_{\text{codebook}} = H(\text{JSON}(\mathcal{C}, \text{normalization}, \varepsilon))$$

---

## 9. Zero-Knowledge Proof System

### 9.1 Public Inputs

| Signal | Description |
|--------|-------------|
| \(\text{prev\_state\_root}\) | State root before block |
| \(\text{new\_state\_root}\) | State root after block |
| \(\text{block\_height}\) | Block number |
| \(\text{tx\_merkle\_root}\) | Merkle root of transactions |
| \(C_{\text{fold}}\) | Folded block commitment |
| \(C_{\text{PQ}}\) | PQ code commitment |
| \(C_{\text{codebook}}\) | Codebook root |

### 9.2 Witness Structure

The ZK witness contains:
- Full transaction list
- Execution traces
- Intermediate folded vectors \(F_B\)
- PQ indices before hashing

### 9.3 Constraint System

**Gadget 1: State Transition**
$$\text{Apply}(\text{prev\_state\_root}, \{tx_i\}) = \text{new\_state\_root}$$

**Gadget 2: Vectorization**
$$\forall i: \mathbf{x}_i = \phi_{tx}(tx_i) \text{ (deterministic)}$$

**Gadget 3: Folding**
$$F_B = \text{Fold}(\{\mathbf{x}_i, \mathbf{s}_j, \mathbf{w}_k\})$$
$$H(F_B) = C_{\text{fold}}$$

**Gadget 4: PQ Encoding**
$$\forall \mathbf{f} \in F_B: \|\mathbf{f} - \hat{\mathbf{f}}\|_2 \leq \varepsilon$$
$$H(\text{indices}) = C_{\text{PQ}}$$

### 9.4 Fixed-Point Arithmetic

| Stage | Format | Range |
|-------|--------|-------|
| Feature normalization | Q2.14 | \([-4, 4)\) |
| Statistics | Q8.24 | \([-256, 256)\) |
| Folding products | Q4.28 | \([-16, 16)\) |
| PQ error check | Q6.26 | \([0, 64)\) |

### 9.5 Halo2 Implementation

The proof system uses Halo2 with:
- **IPA (Inner Product Argument)** commitment scheme
- **BN254 curve** for pairing operations
- **Poseidon hash** for in-circuit commitments
- **Lookup tables** for range checks and centroid access

---

## 10. Atlas Visualization

### 10.1 2D Projection

The Atlas visualizes the folded vector space by projecting hotzones to 2D:

**PCA or t-SNE:**
$$\mathbf{p}_i = \text{Project}(\mathbf{c}_i) \in \mathbb{R}^2$$

### 10.2 Visual Encoding

- **Position:** 2D coordinates from projection
- **Size:** Proportional to \(\rho_i^{0.5}\)
- **Color:** Mapped from dominant semantic tag
- **Edges:** Hyperedges with \(w > \theta\)

### 10.3 3D Force-Directed Layout

For the hypergraph visualization:
- **Node positions:** Force simulation with repulsion
- **Edge springs:** Attraction proportional to \(w(H_i, H_j)\)
- **Node size:** Density-weighted

---

## Summary of Key Parameters

| Parameter | Symbol | Default | Description |
|-----------|--------|---------|-------------|
| Transaction dim | \(d_{tx}\) | 16 | Features per transaction |
| Fold dim | \(d\) | 16 | Canonical vector dimension |
| Components | \(k\) | 4 | Principal directions |
| PQ subspaces | \(m\) | 4 | Codebook partitions |
| PQ centroids | \(K\) | 256 | Centroids per subspace |
| Error bound | \(\varepsilon\) | 0.25 | Max reconstruction error |
| KDE bandwidth | \(h\) | 0.15 | Gaussian kernel width |
| Density threshold | \(\theta\) | 0.02 | Min hotzone density |
| Max hotzones | | 16 | Top-k selection |
| Hyperedge threshold | \(\theta_2\) | 5×10⁻⁵ | Min edge weight |

---

## References

1. **Product Quantization:** Jégou, H., Douze, M., & Schmid, C. (2011). Product quantization for nearest neighbor search. *IEEE TPAMI*.

2. **Kernel Density Estimation:** Silverman, B. W. (1986). *Density Estimation for Statistics and Data Analysis*. Chapman & Hall.

3. **Halo2:** Electric Coin Company. (2020). The Halo2 proving system. https://zcash.github.io/halo2/

4. **BLAKE3:** O'Connor, J., et al. (2020). BLAKE3: One function, fast everywhere. https://github.com/BLAKE3-team/BLAKE3-specs

---

*Document generated for YYSFold v0.1.0*





