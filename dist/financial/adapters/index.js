import { equitiesAdapter } from './equities.js';
import { fxAdapter } from './fx.js';
import { amlAdapter } from './aml.js';
export const financialAdapters = {
    [equitiesAdapter.name]: equitiesAdapter,
    [fxAdapter.name]: fxAdapter,
    [amlAdapter.name]: amlAdapter,
};
