import { FinancialAdapter } from '../types.js';
import { equitiesAdapter } from './equities.js';
import { fxAdapter } from './fx.js';
import { amlAdapter } from './aml.js';

export const financialAdapters: Record<string, FinancialAdapter<unknown>> = {
  [equitiesAdapter.name]: equitiesAdapter,
  [fxAdapter.name]: fxAdapter,
  [amlAdapter.name]: amlAdapter,
};

export type AdapterName = keyof typeof financialAdapters;


