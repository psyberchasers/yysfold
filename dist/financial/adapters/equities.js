import { createHash } from 'crypto';
import { hexlify, keccak256, toUtf8Bytes } from 'ethers';
export const equitiesAdapter = {
    name: 'equities',
    source: 'equities',
    toRawBlock(batch, context = {}) {
        const trades = batch.trades ?? [];
        const timestamp = context.timestamp ??
            batch.timestamp ??
            (trades.length > 0 ? trades[0].timestamp ?? Math.floor(Date.now() / 1000) : Math.floor(Date.now() / 1000));
        const height = context.height ?? timestamp;
        const transactions = trades.map((trade, index) => ({
            hash: `${trade.symbol}-${timestamp}-${index}`,
            amount: trade.price * trade.volume,
            fee: trade.fees ?? 0,
            gasUsed: trade.volume,
            gasPrice: trade.spreadBps ?? 0,
            nonce: index,
            status: 'success',
            chainId: 1,
            sender: trade.side === 'BUY' ? (trade.traderId ?? 'desk-buy') : (trade.traderId ?? 'desk-sell'),
            receiver: trade.symbol,
            contractType: 'EQUITY',
            dataSize: 0,
            side: trade.side,
            venue: trade.venue ?? 'UNKNOWN',
            sector: trade.sector ?? 'UNKNOWN',
            assetClass: 'EQUITY',
            liquidityScore: Math.min(1, trade.volume / 1_000_000),
        }));
        const hashSeed = batch.window ?? `equities-${height}`;
        const pseudoHash = (label) => `0x${createHash('sha256').update(`${hashSeed}-${label}`).digest('hex')}`;
        const headerPayload = toUtf8Bytes(`${hashSeed}:${timestamp}:${trades.length}`);
        const headerRlp = hexlify(headerPayload);
        const blockHash = keccak256(headerPayload);
        return {
            header: {
                height,
                hash: blockHash,
                parentHash: pseudoHash('parent'),
                stateRoot: pseudoHash('state'),
                txRoot: pseudoHash('tx'),
                receiptsRoot: pseudoHash('receipts'),
                timestamp,
                headerRlp,
            },
            transactions,
            executionTraces: trades.map((trade, index) => ({
                balanceDelta: trade.side === 'BUY' ? -trade.price * trade.volume : trade.price * trade.volume,
                storageWrites: 1,
                storageReads: 1,
                logEvents: 1,
                contract: trade.symbol,
                asset: 'EQUITY',
                traceType: trade.side,
                gasConsumed: trade.volume,
                slotIndex: index,
                reverted: false,
            })),
            witnessData: {
                bundles: [
                    {
                        constraintCount: trades.length * 256,
                        degree: 1024,
                        gateCount: trades.length * 128,
                        quotientDegree: 2048,
                        proverLabel: 'equities-adapter',
                        circuitType: 'EQUITY_SUMMARY',
                    },
                ],
            },
        };
    },
};
