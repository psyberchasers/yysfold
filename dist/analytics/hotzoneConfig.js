const BASE_OPTIONS = {
    bandwidth: 0.15,
    threshold: 0.02,
    maxZones: 16,
};
const CHAIN_OVERRIDES = {
    eth: {
        bandwidth: 0.12,
        threshold: 0.015,
        maxZones: 18,
    },
    avax: {
        bandwidth: 0.18,
        threshold: 0.02,
        maxZones: 20,
    },
};
export function resolveHotzoneOptions(chain, overrides = {}) {
    const chainOptions = CHAIN_OVERRIDES[chain] ?? {};
    return {
        ...BASE_OPTIONS,
        ...chainOptions,
        ...overrides,
        contextTags: overrides.contextTags ?? [],
    };
}
