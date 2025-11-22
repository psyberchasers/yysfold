import type { RawBlock } from '../../folding/types.js';
import { FinancialAdapter, AdapterContext } from '../types.js';

interface EquityTrade {
  symbol: string;
  price: number;
  volume: number;
  side: 'BUY' | 'SELL';
  venue?: string;
  sector?: string;
  traderId?: string;
  spreadBps?: number;
  fees?: number;
  timestamp?: number;
}

interface EquityBatch {
  trades: EquityTrade[];
  window?: string;
  timestamp?: number;
}

export const equitiesAdapter: FinancialAdapter<EquityBatch> = {
  name: 'equities',
  source: 'equities',
  toRawBlock(batch, context = {}): RawBlock {
    const trades = batch.trades ?? [];
    const timestamp =
      context.timestamp ??
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

    return {
      header: {
        height,
        prevStateRoot: batch.window ?? 'equities-window',
        newStateRoot: `equities-${height}`,
        timestamp,
        txMerkleRoot: '',
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


