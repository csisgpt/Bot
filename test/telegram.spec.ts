import { describe, expect, it } from 'vitest';
import { formatSignalMessage } from '@libs/telegram';
import { Signal } from '@libs/signals';

describe('telegram formatter', () => {
  it('prints N/A when price is missing', () => {
    const signal: Signal = {
      source: 'TRADINGVIEW',
      assetType: 'GOLD',
      instrument: 'XAUTUSDT',
      interval: '15m',
      strategy: 'tradingview',
      kind: 'ALERT',
      side: 'BUY',
      price: null,
      time: Date.now(),
      confidence: 0,
      tags: ['tv'],
      reason: 'price unavailable',
    };

    const message = formatSignalMessage(signal);
    expect(message).toContain('<b>Price:</b> N/A');
  });
});
