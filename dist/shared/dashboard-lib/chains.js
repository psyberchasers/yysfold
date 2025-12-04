const CHAIN_METADATA = {
    eth: { symbol: 'ETH', minUnit: 'wei', decimals: 18 },
    avax: { symbol: 'AVAX', minUnit: 'wei', decimals: 18 },
    sol: { symbol: 'SOL', minUnit: 'lamports', decimals: 9 },
};
export function getChainMetadata(chain) {
    return CHAIN_METADATA[chain.toLowerCase()] ?? {
        symbol: chain.toUpperCase(),
        minUnit: 'wei',
        decimals: 18,
    };
}
