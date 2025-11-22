export const fxAdapter = {
    name: 'fx',
    source: 'fx',
    toRawBlock(batch) {
        const trades = batch.trades ?? [];
        const timestamp = batch.timestamp ??
            (trades.length > 0 ? trades[0].timestamp ?? Math.floor(Date.now() / 1000) : Math.floor(Date.now() / 1000));
        const height = timestamp;
        const transactions = trades.map((trade, index) => ({
            hash: `${trade.pair}-${timestamp}-${index}`,
            amount: trade.quoteAmount,
            fee: (trade.spreadPips ?? 0) * trade.baseAmount,
            gasUsed: trade.baseAmount,
            gasPrice: trade.spreadPips ?? 0,
            nonce: index,
            status: 'success',
            chainId: 2,
            sender: trade.side === 'BUY' ? trade.pair.split('/')[0] : trade.pair.split('/')[1],
            receiver: trade.pair,
            contractType: 'FX',
            dataSize: 0,
            venue: trade.venue ?? 'UNKNOWN',
            liquidityScore: trade.liquidityScore ?? 0,
            assetClass: 'FX',
            pair: trade.pair,
            spreadPips: trade.spreadPips ?? 0,
        }));
        return {
            header: {
                height,
                prevStateRoot: batch.window ?? 'fx-window',
                newStateRoot: `fx-${height}`,
                timestamp,
                txMerkleRoot: '',
            },
            transactions,
            executionTraces: trades.map((trade, index) => ({
                balanceDelta: trade.quoteAmount,
                storageWrites: 1,
                storageReads: 2,
                logEvents: 1,
                contract: trade.pair,
                asset: 'FX',
                traceType: trade.side,
                gasConsumed: trade.baseAmount,
                slotIndex: index,
                reverted: false,
            })),
            witnessData: {
                bundles: [
                    {
                        constraintCount: trades.length * 200,
                        degree: 2048,
                        gateCount: trades.length * 100,
                        quotientDegree: 4096,
                        proverLabel: 'fx-adapter',
                        circuitType: 'FX_SUMMARY',
                    },
                ],
            },
        };
    },
};
