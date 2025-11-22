use std::{fs::File, io::Write, path::PathBuf, sync::OnceLock};

use anyhow::Result;
use clap::Parser;
use halo2_proofs::{
    plonk::create_proof,
    poly::kzg::{commitment::KZGCommitmentScheme, multiopen::ProverGWC},
    transcript::{Blake2bWrite, Challenge255, TranscriptWriterBuffer},
};
use halo2curves::bn256::{Bn256, G1Affine, Fr};
use rand::SeedableRng;
use rand_chacha::ChaCha20Rng;

use folding_halo2::{circuit::FoldedCircuit, io::load_witness, keys::load_or_init_keys, load_public_inputs};

#[derive(Parser, Debug)]
#[command(version, about = "Halo2 prover for folded blocks")]
struct Args {
    #[arg(long)]
    witness: PathBuf,
    #[arg(long = "public-inputs")]
    public_inputs: PathBuf,
    #[arg(long = "proving-key")]
    proving_key: PathBuf,
    #[arg(long = "verification-key")]
    verification_key: PathBuf,
    #[arg(long = "output")]
    output: PathBuf,
    #[arg(long = "circuit-k", default_value_t = 12)]
    circuit_k: u32,
}

fn main() -> Result<()> {
    let args = Args::parse();

    let witness = load_witness(&args.witness)?;
    let public_inputs = load_public_inputs(&args.public_inputs)?;
    let instances = public_inputs.to_field_elements()?;

    // Ensure witness parsed (even though circuit only checks commitments)
    if witness.folded_vectors.is_empty() || witness.pq_vectors.is_empty() {
        anyhow::bail!("witness must contain foldedVectors");
    }

    let blank = FoldedCircuit::blank(instances.len());

    let (params, pk) =
        load_or_init_keys(&args.proving_key, &args.verification_key, args.circuit_k, &blank)?;

    let epsilon_squared = Fr::from(4);
    let circuit = FoldedCircuit {
        public_inputs: instances.clone(),
        folded_vectors: to_field_matrix(&witness.folded_vectors),
        pq_vectors: to_field_matrix(&witness.pq_vectors),
        epsilon_squared,
    };

    let instance_container = vec![instances];
    let instance_refs: Vec<&[halo2curves::bn256::Fr]> =
        instance_container.iter().map(|v| v.as_slice()).collect();
    let circuit_instances: Vec<&[&[halo2curves::bn256::Fr]]> = vec![&instance_refs[..]];
    let circuits = vec![circuit.clone()];

    let mut transcript =
        Blake2bWrite::<Vec<u8>, halo2curves::bn256::G1Affine, Challenge255<_>>::init(vec![]);

    let rng = ChaCha20Rng::from_entropy();

    create_proof::<
        KZGCommitmentScheme<Bn256>,
        ProverGWC<'_, Bn256>,
        Challenge255<G1Affine>,
        ChaCha20Rng,
        Blake2bWrite<Vec<u8>, G1Affine, Challenge255<G1Affine>>,
        FoldedCircuit,
    >(
        &params,
        &pk,
        &circuits,
        &circuit_instances,
        rng,
        &mut transcript,
    )?;

    let proof = transcript.finalize();
    let mut file = File::create(&args.output)?;
    file.write_all(&proof)?;
    Ok(())
}

fn to_field_matrix(input: &[Vec<f64>]) -> Vec<Vec<Fr>> {
    input
        .iter()
        .map(|row| row.iter().map(|value| float_to_field(*value)).collect())
        .collect()
}

fn float_to_field(value: f64) -> Fr {
    const SCALE: f64 = 1_000_000.0;
    let scaled = (value * SCALE).round() as i64;
    from_i64(scaled) * scale_inv()
}

fn from_i64(value: i64) -> Fr {
    if value >= 0 {
        Fr::from(value as u64)
    } else {
        -Fr::from((-value) as u64)
    }
}

fn scale_inv() -> Fr {
    static INV: OnceLock<Fr> = OnceLock::new();
    *INV.get_or_init(|| {
        Fr::from(1_000_000u64)
            .invert()
            .expect("scale must have inverse in field")
    })
}

