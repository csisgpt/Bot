import { ema, rsi } from './indicators';
import { Kline } from '@libs/binance';

export type SignalType = 'BUY' | 'SELL';

export interface StrategySignal {
  symbol: string;
  interval: string;
  type: SignalType;
  time: number;
  price: number;
  emaFast: number;
  emaSlow: number;
  rsi: number;
}

export function emaRsiStrategy(
  symbol: string,
  interval: string,
  klines: Kline[],
): StrategySignal | null {
  if (klines.length < 30) {
    return null;
  }

  const closes = klines.map((kline) => kline.close);
  const emaFast = ema(closes, 12);
  const emaSlow = ema(closes, 26);
  const rsiValues = rsi(closes, 14);

  const lastIndex = klines.length - 1;
  const prevIndex = klines.length - 2;

  const prevFast = emaFast[prevIndex];
  const prevSlow = emaSlow[prevIndex];
  const currFast = emaFast[lastIndex];
  const currSlow = emaSlow[lastIndex];
  const currRsi = rsiValues[lastIndex];

  const latest = klines[lastIndex];

  if (prevFast <= prevSlow && currFast > currSlow && currRsi < 70) {
    return {
      symbol,
      interval,
      type: 'BUY',
      time: latest.openTime,
      price: latest.close,
      emaFast: currFast,
      emaSlow: currSlow,
      rsi: currRsi,
    };
  }

  if (prevFast >= prevSlow && currFast < currSlow && currRsi > 30) {
    return {
      symbol,
      interval,
      type: 'SELL',
      time: latest.openTime,
      price: latest.close,
      emaFast: currFast,
      emaSlow: currSlow,
      rsi: currRsi,
    };
  }

  return null;
}
