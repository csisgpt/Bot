import { rsi } from '../indicators';
import { Strategy } from './types';

interface RsiThresholdConfig {
  rsiPeriod: number;
  rsiBuyThreshold: number;
  rsiSellThreshold: number;
}

export const createRsiThresholdStrategy = (config: RsiThresholdConfig): Strategy => ({
  name: 'rsi_threshold',
  run: ({ candles, instrument, interval, assetType }) => {
    if (candles.length < config.rsiPeriod + 1) {
      return null;
    }

    const closes = candles.map((candle) => candle.close);
    const rsiValues = rsi(closes, config.rsiPeriod);
    const lastIndex = candles.length - 1;
    const currRsi = rsiValues[lastIndex];
    const latest = candles[lastIndex];

    if (currRsi <= config.rsiBuyThreshold) {
      return {
        source: 'BINANCE',
        assetType,
        instrument,
        interval,
        strategy: 'rsi_threshold',
        kind: 'ENTRY',
        side: 'BUY',
        price: latest.close,
        time: latest.closeTime,
        confidence: 66,
        tags: ['rsi', 'mean_reversion'],
        reason: `RSI ${currRsi.toFixed(2)} below buy threshold ${config.rsiBuyThreshold}.`,
      };
    }

    if (currRsi >= config.rsiSellThreshold) {
      return {
        source: 'BINANCE',
        assetType,
        instrument,
        interval,
        strategy: 'rsi_threshold',
        kind: 'ENTRY',
        side: 'SELL',
        price: latest.close,
        time: latest.closeTime,
        confidence: 66,
        tags: ['rsi', 'mean_reversion'],
        reason: `RSI ${currRsi.toFixed(2)} above sell threshold ${config.rsiSellThreshold}.`,
      };
    }

    return null;
  },
});
