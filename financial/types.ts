import type { RawBlock } from '../folding/types.js';

export interface AdapterContext {
  height?: number;
  timestamp?: number;
}

export interface FinancialAdapter<TInput = unknown> {
  readonly name: string;
  readonly source: string;
  toRawBlock(input: TInput, context?: AdapterContext): RawBlock;
}


