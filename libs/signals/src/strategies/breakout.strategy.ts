import { Strategy } from './types';

interface BreakoutConfig {
  lookback: number;
}

export const createBreakoutStrategy = (config: BreakoutConfig): Strategy => ({
  id: 'breakout',
  displayName: 'Breakout',
  requiredIndicators: ['high', 'low'],
  evaluate: ({ candles, instrument, interval, assetType }) => {
    if (candles.length < config.lookback + 1) {
      return null;
    }

    const lastIndex = candles.length - 1;
    const lookbackCandles = candles.slice(lastIndex - config.lookback, lastIndex);
    const high = Math.max(...lookbackCandles.map((candle) => candle.high));
    const low = Math.min(...lookbackCandles.map((candle) => candle.low));
    const latest = candles[lastIndex];

    if (latest.close > high) {
      return {
        source: 'BINANCE',
        assetType,
        instrument,
        interval,
        strategy: 'breakout',
        kind: 'ENTRY',
        side: 'BUY',
        price: latest.close,
        time: latest.closeTime,
        confidence: 72,
        tags: ['breakout', 'momentum'],
        reason: `Close ${latest.close.toFixed(4)} broke above ${config.lookback}-period high ${high.toFixed(
          4,
        )}.`,
        why: 'Price closed above the recent high, signaling breakout momentum.',
        indicators: {
          lookbackHigh: high,
          lookbackLow: low,
        },
      };
    }

    if (latest.close < low) {
      return {
        source: 'BINANCE',
        assetType,
        instrument,
        interval,
        strategy: 'breakout',
        kind: 'ENTRY',
        side: 'SELL',
        price: latest.close,
        time: latest.closeTime,
        confidence: 72,
        tags: ['breakout', 'momentum'],
        reason: `Close ${latest.close.toFixed(4)} broke below ${config.lookback}-period low ${low.toFixed(
          4,
        )}.`,
        why: 'Price closed below the recent low, signaling downside momentum.',
        indicators: {
          lookbackHigh: high,
          lookbackLow: low,
        },
      };
    }

    return null;
  },
});
