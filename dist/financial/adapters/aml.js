import { createHash } from 'crypto';
import { hexlify, keccak256, toUtf8Bytes } from 'ethers';
export const amlAdapter = {
    name: 'aml',
    source: 'aml',
    toRawBlock(batch) {
        const alerts = batch.alerts ?? [];
        const timestamp = batch.timestamp ??
            (alerts.length > 0 ? alerts[0].timestamp ?? Math.floor(Date.now() / 1000) : Math.floor(Date.now() / 1000));
        const height = timestamp;
        const transactions = alerts.map((alert, index) => ({
            hash: `${alert.entityId}-${timestamp}-${index}`,
            amount: alert.amount ?? alert.riskScore,
            fee: alert.riskScore,
            gasUsed: alert.riskScore,
            gasPrice: alert.amount ?? 0,
            nonce: index,
            status: 'success',
            chainId: 999,
            sender: alert.entityId,
            receiver: alert.alertType,
            contractType: 'AML',
            dataSize: 0,
            jurisdiction: alert.jurisdiction ?? 'UNKNOWN',
            currency: alert.currency ?? 'UNKNOWN',
            triggeredRule: alert.triggeredRule ?? 'GENERIC',
            assetClass: 'AML',
            alertType: alert.alertType,
            riskScore: alert.riskScore,
        }));
        const hashSeed = batch.batchId ?? `aml-${height}`;
        const pseudoHash = (label) => `0x${createHash('sha256').update(`${hashSeed}-${label}`).digest('hex')}`;
        const headerPayload = toUtf8Bytes(`${hashSeed}:${timestamp}:${alerts.length}`);
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
            executionTraces: alerts.map((alert, index) => ({
                balanceDelta: alert.riskScore,
                storageWrites: 0,
                storageReads: 0,
                logEvents: 1,
                contract: alert.alertType,
                asset: 'AML',
                traceType: alert.triggeredRule ?? 'RULE',
                gasConsumed: alert.riskScore,
                slotIndex: index,
                reverted: false,
            })),
            witnessData: {
                bundles: [
                    {
                        constraintCount: alerts.length * 64,
                        degree: 1024,
                        gateCount: alerts.length * 32,
                        quotientDegree: 2048,
                        proverLabel: 'aml-adapter',
                        circuitType: 'AML_SUMMARY',
                    },
                ],
            },
        };
    },
};
