import { describe, expect, it } from 'vitest';
import { atr, ema, macd, rsi } from '@libs/signals';

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

  it('calculates atr with same length', () => {
    const highs = [10, 11, 12, 11, 13];
    const lows = [9, 10, 11, 10, 12];
    const closes = [9.5, 10.5, 11.5, 10.8, 12.5];
    const result = atr(highs, lows, closes, 3);
    expect(result).toHaveLength(highs.length);
  });

  it('calculates macd outputs with same length', () => {
    const values = Array.from({ length: 40 }, (_, index) => 100 + index * 0.5);
    const result = macd(values, 12, 26, 9);
    expect(result.macdLine).toHaveLength(values.length);
    expect(result.signalLine).toHaveLength(values.length);
    expect(result.histogram).toHaveLength(values.length);
  });
});
