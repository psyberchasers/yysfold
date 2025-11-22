export const LENDING_CONTRACTS = [
    { address: '0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9', label: 'Aave v2 Lending Pool' },
    { address: '0x8f8ef111b67c04eb1641f5ff19ee54cda062f163', label: 'Aave v3 Portal' },
    { address: '0x3dfd63e61e255587d21d06b5d7cf58050ff48c7a', label: 'Aave v3 Pool' },
    { address: '0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac', label: 'Compound v2 cETH' },
    { address: '0x3f0a0ea2f86bae6362cf9799b523ba06647da018', label: 'Compound v3 Comet' },
    { address: '0xbcca60bb61934080951369a648fb03df4f96263c', label: 'Aave USDC Reserve' },
];
export const LENDING_CONTRACT_ADDRESSES = LENDING_CONTRACTS.map((entry) => entry.address);
export const LENDING_CONTRACT_LABELS = LENDING_CONTRACTS.reduce((acc, entry) => {
    acc[entry.address.toLowerCase()] = entry.label;
    return acc;
}, {});
export function normalizeAddress(value) {
    if (typeof value !== 'string')
        return null;
    if (!value.startsWith('0x'))
        return null;
    return value.toLowerCase();
}
