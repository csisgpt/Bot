import { describe, expect, it } from 'vitest';
import { matchesRoutingRule } from '@libs/signals';
import { Signal } from '@libs/signals';

const signal: Signal = {
  source: 'BINANCE',
  assetType: 'GOLD',
  instrument: 'XAUTUSDT',
  interval: '15m',
  strategy: 'ema_rsi',
  kind: 'ENTRY',
  side: 'BUY',
  price: 2000,
  time: Date.UTC(2024, 0, 1, 0, 15, 0),
  confidence: 80,
  tags: ['test'],
  reason: 'test',
};

describe('routing rule matching', () => {
  it('matches when filters align', () => {
    const rule = {
      assetType: 'GOLD' as const,
      instrumentId: 'inst-1',
      strategyId: 'strat-1',
      interval: '15m',
      minConfidence: 70,
    };

    expect(matchesRoutingRule(rule, signal, { instrumentId: 'inst-1', strategyId: 'strat-1' })).toBe(
      true,
    );
  });

  it('rejects when confidence is too low', () => {
    const rule = {
      assetType: 'GOLD' as const,
      instrumentId: null,
      strategyId: null,
      interval: null,
      minConfidence: 90,
    };

    expect(matchesRoutingRule(rule, signal, {})).toBe(false);
  });

  it('rejects when instrument does not match', () => {
    const rule = {
      assetType: null,
      instrumentId: 'inst-2',
      strategyId: null,
      interval: null,
      minConfidence: null,
    };

    expect(matchesRoutingRule(rule, signal, { instrumentId: 'inst-1' })).toBe(false);
  });
});
