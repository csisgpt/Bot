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
        reason: `قیمت پایانی ${latest.close.toFixed(4)} از سقف ${config.lookback} کندل (${high.toFixed(
          4,
        )}) عبور کرد.`,
        why: 'قیمت بالاتر از سقف اخیر بسته شد و مومنتوم بریک\u200cاوت را نشان می\u200cدهد.',
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
        reason: `قیمت پایانی ${latest.close.toFixed(4)} پایین\u200cتر از کف ${config.lookback} کندل (${low.toFixed(
          4,
        )}) بسته شد.`,
        why: 'قیمت پایین\u200cتر از کف اخیر بسته شد و مومنتوم نزولی را نشان می\u200cدهد.',
        indicators: {
          lookbackHigh: high,
          lookbackLow: low,
        },
      };
    }

    return null;
  },
});
