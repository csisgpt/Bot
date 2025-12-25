import { describe, expect, it } from 'vitest';
import { buildSignalDedupeKey, floorSignalTimeToBucket } from '@libs/signals';
import { Signal } from '@libs/signals';

const baseSignal: Signal = {
  source: 'BINANCE',
  assetType: 'GOLD',
  instrument: 'XAUTUSDT',
  interval: '15m',
  strategy: 'ema_rsi',
  kind: 'ENTRY',
  side: 'BUY',
  price: 2000,
  time: Date.UTC(2024, 0, 1, 0, 7, 30),
  confidence: 70,
  tags: ['test'],
  reason: 'test',
};

describe('dedupe key bucketing', () => {
  it('floors time to the interval boundary', () => {
    const bucketed = floorSignalTimeToBucket(baseSignal.time, baseSignal.interval);
    expect(new Date(bucketed).toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('falls back to minute buckets for unknown intervals', () => {
    const time = Date.UTC(2024, 0, 1, 0, 7, 59);
    const bucketed = floorSignalTimeToBucket(time, 'weird');
    expect(new Date(bucketed).toISOString()).toBe('2024-01-01T00:07:00.000Z');
  });

  it('builds deterministic keys', () => {
    const key = buildSignalDedupeKey(baseSignal);
    expect(key).toBe(
      'BINANCE:GOLD:XAUTUSDT:15m:ema_rsi:ENTRY:BUY:2024-01-01T00:00:00.000Z',
    );
  });
});
