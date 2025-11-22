export type NumericVector = number[];

export type TxVector = NumericVector;
export type StateVector = NumericVector;
export type WitnessVector = NumericVector;

export interface BlockHeader {
  height: number;
  prevStateRoot: string;
  newStateRoot: string;
  timestamp?: number;
  txMerkleRoot?: string;
}

export interface RawBlock {
  header: BlockHeader;
  transactions: Record<string, unknown>[];
  executionTraces: Record<string, unknown>[];
  witnessData: Record<string, unknown>;
}

export interface VectorizedBlock {
  txVectors: TxVector[];
  stateVectors: StateVector[];
  witnessVectors: WitnessVector[];
}

export interface FoldedBlockMetadata {
  blockHeight: number;
  txCount: number;
  timestamp?: number;
  notes?: string;
}

export interface FoldedBlock {
  foldedVectors: NumericVector[];
  metadata: FoldedBlockMetadata;
}

export interface PQCodebook {
  centroids: number[][][];
  subvectorDim: number;
  numCentroids: number;
  numSubspaces: number;
}

export interface PQCode {
  indices: number[][];
}

export interface Commitments {
  foldedCommitment: string;
  pqCommitment: string;
}

export interface FoldedArtifact {
  foldedBlock: FoldedBlock;
  pqCode: PQCode;
  commitments: Commitments;
}

