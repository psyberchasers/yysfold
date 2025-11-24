# Zero-Knowledge Commitments Overview

This note describes how the folding/PQ pipeline is bound into Halo2 proofs, how we map floating-point analytics into field elements, and what it means for downstream verifiers.

## 1. Commitments & Public Inputs

We publish three BLAKE3 commitments per fingerprint:

1. `foldedCommitment` – hashes the folded vectors plus metadata for the current block/batch.
2. `pqCommitment` – hashes the PQ indices and residual payloads emitted by `pqEncode`.
3. `codebookRoot` – hashes the entire codebook manifest (centroids, normalization stats, error bound, residual stats).

Inside Halo2 we do **not** re-implement BLAKE3. Instead:

- The host pipeline computes the 32-byte digests for each commitment.
- We convert each digest into a BN254 field element via the hash-to-field routine described below.
- Those three field elements become the **only** public inputs to the circuit.
- The circuit recomputes the same commitments from its witness (folded vectors, PQ vectors, codebook metadata) and constrains them equal to the supplied public inputs.

This gives us a succinct proof that *“these folded vectors/PQ codes/codebook revision are internally consistent and match the commitments exposed to verifiers.”*

## 2. Hash-to-Field Conversion

Given a 32-byte BLAKE3 digest `d`:

1. Interpret `d` as a big-endian integer.
2. Reduce it modulo the BN254 scalar field modulus `p`.
3. Use the resulting integer as the canonical `Fr`.

In code we currently reuse the deterministic `hex_to_field` helper (which feeds the bytes through BLAKE3 again before sampling a ChaCha20 RNG). This produces a uniform field element while avoiding any in-circuit hashing cost.

## 3. Fixed-Point Scaling (Float → Field)

All analytics that originate as floating-point numbers (folded vectors, PQ reconstructions, KDE densities, residual norms) are mapped into the field using a fixed scaling factor:

```
scale = 1_000_000  (1e6)

scaled_int = floor(float_value * scale)
field_element = scaled_int * scale^{-1}  (mod p)
```

Why this helps:

- **Deterministic serialization** – every float is rounded in the same direction (`floor`), so Rust and TypeScript witnesses agree bit-for-bit.
- **Precision vs constraint cost** – 1e6 preserves six digits after the decimal, which is plenty for densities/residuals while keeping values far below the field modulus.
- **Stable residual checks** – the circuit squares differences of these scaled integers; keeping magnitudes small avoids overflow and keeps constraint degree low.

So yes, it *starts* as “float to field,” but we explicitly step through an integer fixed-point layer to avoid floating-point ambiguity.

## 4. Witness Layout

- `folded_vectors`: matrix of scaled `Fr` values (per folded component).
- `pq_vectors`: PQ reconstruction vectors (also scaled).
- `epsilon_squared`: per-vector residual norms = Σ (folded − pq)^2, scaled and optionally multiplied by `HALO2_EPSILON_MULTIPLIER`.
- `commitments`: three `Fr` elements passed as part of the witness, equalized with the public inputs.

## 5. Verification Pipeline

1. Ingestion emits the JSON summary + proof and stores them under `artifacts/`.
2. `/api/verify` loads the stored proof and public inputs, converts the hex commitments → field elements, and calls the Halo2 verifier binary.
3. Verifier checks:
   - component difference gates (folded vs PQ),
   - epsilon residual gate,
   - equality gates tying witness commitments to the public inputs.
4. On success we respond with `status: "verified"` and echo the commitments used.

## 6. Planned Extensions

- Bind block roots (prev/new state root, tx Merkle root) via the same hash-to-field strategy in a Phase-2 circuit.
- Add an in-circuit Poseidon/BLAKE2s gadget if we ever need to recompute commitments on-chain.
- Extend public inputs to include anomaly components once we want verifiers to attest to the score as well.

For the current release, the above is the complete scope: three commitments, 1e6 fixed-point scaling throughout, and off-circuit hashing with on-circuit equality.

