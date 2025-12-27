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
  id: 'ema_rsi',
  displayName: 'EMA + RSI',
  requiredIndicators: ['ema_fast', 'ema_slow', 'rsi'],
  evaluate: ({ candles, instrument, interval, assetType }) => {
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
        source: 'BINANCE',
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
        reason: `EMA${config.emaFastPeriod} بالای EMA${config.emaSlowPeriod} کراس کرد و RSI برابر ${currRsi.toFixed(
          2,
        )} بود.`,
        why: 'EMA سریع بالای EMA کند قرار گرفت و RSI زیر ناحیه\u000cی اشباع خرید باقی ماند.',
        indicators: {
          emaFast: currFast,
          emaSlow: currSlow,
          rsi: currRsi,
        },
      };
    }

    if (prevFast >= prevSlow && currFast < currSlow && currRsi > config.rsiBuyThreshold) {
      return {
        source: 'BINANCE',
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
        reason: `EMA${config.emaFastPeriod} پایین EMA${config.emaSlowPeriod} کراس کرد و RSI برابر ${currRsi.toFixed(
          2,
        )} بود.`,
        why: 'EMA سریع زیر EMA کند قرار گرفت و RSI بالای ناحیه\u000cی اشباع فروش باقی ماند.',
        indicators: {
          emaFast: currFast,
          emaSlow: currSlow,
          rsi: currRsi,
        },
      };
    }

    return null;
  },
});
