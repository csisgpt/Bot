import { macd } from '../indicators';
import { Strategy } from './types';

interface MacdConfig {
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
}

export const createMacdStrategy = (config: MacdConfig): Strategy => ({
  id: 'macd',
  displayName: 'MACD Crossover',
  requiredIndicators: ['macd', 'signal'],
  evaluate: ({ candles, instrument, interval, assetType }) => {
    if (candles.length < config.slowPeriod + config.signalPeriod) {
      return null;
    }

    const closes = candles.map((candle) => candle.close);
    const { macdLine, signalLine } = macd(
      closes,
      config.fastPeriod,
      config.slowPeriod,
      config.signalPeriod,
    );

    const lastIndex = candles.length - 1;
    const prevIndex = candles.length - 2;
    const prevMacd = macdLine[prevIndex];
    const prevSignal = signalLine[prevIndex];
    const currMacd = macdLine[lastIndex];
    const currSignal = signalLine[lastIndex];
    const latest = candles[lastIndex];

    if (prevMacd <= prevSignal && currMacd > currSignal) {
      return {
        source: 'BINANCE',
        assetType,
        instrument,
        interval,
        strategy: 'macd',
        kind: 'ENTRY',
        side: 'BUY',
        price: latest.close,
        time: latest.closeTime,
        confidence: 74,
        tags: ['macd', 'momentum'],
        reason: `MACD crossed above signal (${currMacd.toFixed(4)} > ${currSignal.toFixed(4)}).`,
        why: 'MACD line crossed above the signal line, showing bullish momentum.',
        indicators: {
          macd: currMacd,
          signal: currSignal,
        },
      };
    }

    if (prevMacd >= prevSignal && currMacd < currSignal) {
      return {
        source: 'BINANCE',
        assetType,
        instrument,
        interval,
        strategy: 'macd',
        kind: 'ENTRY',
        side: 'SELL',
        price: latest.close,
        time: latest.closeTime,
        confidence: 74,
        tags: ['macd', 'momentum'],
        reason: `MACD crossed below signal (${currMacd.toFixed(4)} < ${currSignal.toFixed(4)}).`,
        why: 'MACD line crossed below the signal line, showing bearish momentum.',
        indicators: {
          macd: currMacd,
          signal: currSignal,
        },
      };
    }

    return null;
  },
});
