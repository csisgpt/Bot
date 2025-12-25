import { describe, expect, it } from 'vitest';
import { Candle, createBreakoutStrategy, createEmaRsiStrategy, createMacdStrategy, createRsiThresholdStrategy } from '@libs/signals';

const buildCandles = (closes: number[]): Candle[] =>
  closes.map((close, index) => ({
    openTime: index * 60000,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1000,
    closeTime: index * 60000 + 59999,
  }));

describe('strategies', () => {
  it('breakout strategy emits BUY on breakout', () => {
    const closes = [100, 101, 102, 103, 104, 105, 106, 115];
    const candles = buildCandles(closes);
    const strategy = createBreakoutStrategy({ lookback: 5 });

    const signal = strategy.run({
      candles,
      instrument: 'XAUTUSDT',
      interval: '15m',
      assetType: 'GOLD',
    });

    expect(signal?.side).toBe('BUY');
    expect(signal?.strategy).toBe('breakout');
  });

  it('ema_rsi strategy emits BUY on EMA cross with RSI filter', () => {
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
    const candles = buildCandles(closes);
    const strategy = createEmaRsiStrategy({
      emaFastPeriod: 12,
      emaSlowPeriod: 26,
      rsiPeriod: 14,
      rsiBuyThreshold: 30,
      rsiSellThreshold: 70,
    });

    const signal = strategy.run({
      candles,
      instrument: 'BTCUSDT',
      interval: '1h',
      assetType: 'CRYPTO',
    });

    expect(signal?.side).toBe('BUY');
    expect(signal?.strategy).toBe('ema_rsi');
  });

  it('rsi_threshold strategy emits SELL when RSI is high', () => {
    const closes = Array.from({ length: 40 }, (_, index) => 100 + index * 1.5);
    const candles = buildCandles(closes);
    const strategy = createRsiThresholdStrategy({
      rsiPeriod: 14,
      rsiBuyThreshold: 30,
      rsiSellThreshold: 70,
    });

    const signal = strategy.run({
      candles,
      instrument: 'ETHUSDT',
      interval: '15m',
      assetType: 'CRYPTO',
    });

    expect(signal?.side).toBe('SELL');
    expect(signal?.strategy).toBe('rsi_threshold');
  });

  it('macd strategy emits BUY on crossover', () => {
    const closes: number[] = [];
    let price = 100;
    for (let i = 0; i < 30; i += 1) {
      price -= 0.6;
      closes.push(price);
    }
    for (let i = 0; i < 30; i += 1) {
      price += 0.8;
      closes.push(price);
    }
    const candles = buildCandles(closes);
    const strategy = createMacdStrategy({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });

    const signal = strategy.run({
      candles,
      instrument: 'BTCUSDT',
      interval: '1h',
      assetType: 'CRYPTO',
    });

    expect(signal?.strategy).toBe('macd');
    expect(signal?.side).toBe('BUY');
  });
});
