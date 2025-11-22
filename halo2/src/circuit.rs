use halo2_proofs::{
    circuit::{Cell, Layouter, Region, SimpleFloorPlanner, Value},
    plonk::{Advice, Circuit, Column, ConstraintSystem, Error, Instance, Selector},
    poly::Rotation,
};
use halo2curves::bn256::Fr;

#[derive(Clone, Debug)]
pub struct FoldedConfig {
    advice: Column<Advice>,
    instance: Column<Instance>,
    diff_selector: Selector,
    sum_selector: Selector,
}

#[derive(Clone, Debug, Default)]
pub struct FoldedCircuit {
    pub public_inputs: Vec<Fr>,
    pub folded_vectors: Vec<Vec<Fr>>,
    pub pq_vectors: Vec<Vec<Fr>>,
    pub epsilon_squared: Fr,
}

impl FoldedCircuit {
    pub fn blank(len: usize) -> Self {
        Self {
            public_inputs: vec![Fr::from(0); len],
            folded_vectors: vec![],
            pq_vectors: vec![],
            epsilon_squared: Fr::from(0),
        }
    }
}

impl Circuit<Fr> for FoldedCircuit {
    type Config = FoldedConfig;
    type FloorPlanner = SimpleFloorPlanner;
    type Params = ();

    fn without_witnesses(&self) -> Self {
        Self::blank(self.public_inputs.len())
    }

    fn params(&self) -> Self::Params {
        ()
    }

    fn configure(meta: &mut ConstraintSystem<Fr>) -> Self::Config {
        let advice = meta.advice_column();
        let instance = meta.instance_column();
        let diff_selector = meta.selector();
        let sum_selector = meta.selector();
        meta.enable_equality(advice);
        meta.enable_equality(instance);
        meta.create_gate("folded_diff", |meta| {
            let s = meta.query_selector(diff_selector);
            let folded = meta.query_advice(advice, Rotation::cur());
            let pq = meta.query_advice(advice, Rotation::next());
            let diff = meta.query_advice(advice, Rotation(2));
            vec![s * (folded - pq - diff)]
        });
        meta.create_gate("epsilon_check", |meta| {
            let s = meta.query_selector(sum_selector);
            let value = meta.query_advice(advice, Rotation::cur());
            vec![s * value]
        });
        FoldedConfig {
            advice,
            instance,
            diff_selector,
            sum_selector,
        }
    }

    fn synthesize(
        &self,
        config: Self::Config,
        mut layouter: impl Layouter<Fr>,
    ) -> Result<(), Error> {
        let FoldedConfig { advice, instance, .. } = config.clone();
        let mut assigned: Vec<Cell> = Vec::with_capacity(self.public_inputs.len());
        layouter.assign_region(
            || "public inputs copy",
            |mut region| {
                for (row, value) in self.public_inputs.iter().enumerate() {
                    let cell = region.assign_advice(advice, row, Value::known(*value));
                    assigned.push(cell.cell());
                }
                Ok(())
            },
        )?;
        for (row, cell) in assigned.into_iter().enumerate() {
            layouter.constrain_instance(cell, instance, row);
        }

        if self.folded_vectors.len() == self.pq_vectors.len() && !self.folded_vectors.is_empty() {
            let batches = self.folded_vectors.iter().zip(self.pq_vectors.iter());
            for (batch_idx, (folded, pq)) in batches.enumerate() {
                enforce_component_difference(
                    &mut layouter,
                    &config,
                    folded,
                    pq,
                    self.epsilon_squared,
                    batch_idx,
                )?;
            }
        }

        Ok(())
    }
}

fn enforce_component_difference(
    layouter: &mut impl Layouter<Fr>,
    config: &FoldedConfig,
    folded: &[Fr],
    pq: &[Fr],
    epsilon_squared: Fr,
    batch_idx: usize,
) -> Result<(), Error> {
    if folded.len() != pq.len() {
        return Err(Error::Synthesis);
    }
    let pairs: Vec<_> = folded.iter().zip(pq.iter()).collect();
    layouter.assign_region(
        || format!("diff_batch_{batch_idx}"),
        |mut region: Region<'_, Fr>| {
            let mut offset = 0;
            let mut sum = Fr::zero();
            for (_idx, (a, b)) in pairs.iter().enumerate() {
                let diff = **a - **b;
                sum += diff.square();
                region.assign_advice(config.advice, offset, Value::known(**a));
                region.assign_advice(config.advice, offset + 1, Value::known(**b));
                region.assign_advice(config.advice, offset + 2, Value::known(diff));
                config.diff_selector.enable(&mut region, offset)?;
                offset += 3;
            }
            region.assign_advice(config.advice, offset, Value::known(sum - epsilon_squared));
            config.sum_selector.enable(&mut region, offset)?;
            Ok(())
        },
    )
}

