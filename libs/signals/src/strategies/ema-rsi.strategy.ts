import { ema, rsi } from '../indicators';
import { Strategy } from './types';

interface EmaRsiConfig {
  emaFastPeriod: number;
  emaSlowPeriod: number;
  rsiPeriod: number;
  rsiBuyThreshold: number;
  rsiSellThreshold: number;
}

export const createEmaRsiStrategy = (config: EmaRsiConfig): Strategy => ({
  name: 'ema_rsi',
  run: ({ candles, instrument, interval, assetType }) => {
    if (candles.length < Math.max(config.emaSlowPeriod, config.rsiPeriod) + 2) {
      return null;
    }

    const closes = candles.map((candle) => candle.close);
    const emaFast = ema(closes, config.emaFastPeriod);
    const emaSlow = ema(closes, config.emaSlowPeriod);
    const rsiValues = rsi(closes, config.rsiPeriod);

    const lastIndex = candles.length - 1;
    const prevIndex = candles.length - 2;
    const prevFast = emaFast[prevIndex];
    const prevSlow = emaSlow[prevIndex];
    const currFast = emaFast[lastIndex];
    const currSlow = emaSlow[lastIndex];
    const currRsi = rsiValues[lastIndex];
    const latest = candles[lastIndex];

    if (prevFast <= prevSlow && currFast > currSlow && currRsi < config.rsiSellThreshold) {
      return {
        assetType,
        instrument,
        interval,
        strategy: 'ema_rsi',
        kind: 'ENTRY',
        side: 'BUY',
        price: latest.close,
        time: latest.closeTime,
        confidence: 78,
        tags: ['ema_cross', 'rsi_filter', 'trend'],
        reason: `EMA${config.emaFastPeriod} crossed above EMA${config.emaSlowPeriod} with RSI ${currRsi.toFixed(
          2,
        )}.`,
      };
    }

    if (prevFast >= prevSlow && currFast < currSlow && currRsi > config.rsiBuyThreshold) {
      return {
        assetType,
        instrument,
        interval,
        strategy: 'ema_rsi',
        kind: 'ENTRY',
        side: 'SELL',
        price: latest.close,
        time: latest.closeTime,
        confidence: 78,
        tags: ['ema_cross', 'rsi_filter', 'trend'],
        reason: `EMA${config.emaFastPeriod} crossed below EMA${config.emaSlowPeriod} with RSI ${currRsi.toFixed(
          2,
        )}.`,
      };
    }

    return null;
  },
});
