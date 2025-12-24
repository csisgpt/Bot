import { describe, expect, it } from 'vitest';
import { ema, rsi, emaRsiStrategy } from '@libs/signals';
import { Kline } from '@libs/binance';

const buildKlines = (closes: number[]): Kline[] =>
  closes.map((close, index) => ({
    openTime: index * 60000,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000,
    closeTime: index * 60000 + 59999,
  }));

describe('indicators', () => {
  it('calculates ema with same length', () => {
    const values = [1, 2, 3, 4, 5];
    const result = ema(values, 3);
    expect(result).toHaveLength(values.length);
  });

  it('calculates rsi with same length', () => {
    const values = [1, 2, 1.5, 2.5, 2.2, 2.7, 2.4, 2.9, 3.0, 3.2, 3.1, 3.3, 3.4, 3.5, 3.6];
    const result = rsi(values, 14);
    expect(result).toHaveLength(values.length);
  });
});

describe('emaRsiStrategy', () => {
  it('returns null when not enough data', () => {
    const klines = buildKlines([1, 2, 3]);
    expect(emaRsiStrategy('BTCUSDT', '1h', klines)).toBeNull();
  });

  it('returns a BUY signal when EMA crosses with RSI filter', () => {
    const closes: number[] = [];
    let price = 100;
    for (let i = 0; i < 60; i += 1) {
      price -= 0.4;
      closes.push(price);
    }
    for (let i = 0; i < 24; i += 1) {
      price += 0.15;
      closes.push(price);
    }

    const klines = buildKlines(closes);
    const signal = emaRsiStrategy('BTCUSDT', '1h', klines);
    expect(signal).not.toBeNull();
    expect(signal?.type).toBe('BUY');
  });
});
