export function ema(values: number[], period: number): number[] {
  if (values.length === 0) {
    return [];
  }

  const k = 2 / (period + 1);
  const result: number[] = [values[0]];

  for (let i = 1; i < values.length; i += 1) {
    const prev = result[i - 1];
    result.push(values[i] * k + prev * (1 - k));
  }

  return result;
}

export function rsi(values: number[], period = 14): number[] {
  if (values.length === 0) {
    return [];
  }

  const result: number[] = new Array(values.length).fill(0);
  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period && i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) {
      gainSum += delta;
    } else {
      lossSum += Math.abs(delta);
    }
  }

  for (let i = period + 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);

    gainSum = (gainSum * (period - 1) + gain) / period;
    lossSum = (lossSum * (period - 1) + loss) / period;

    const rs = lossSum === 0 ? 100 : gainSum / lossSum;
    result[i] = 100 - 100 / (1 + rs);
  }

  return result;
}

export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number[] {
  if (highs.length === 0 || lows.length === 0 || closes.length === 0) {
    return [];
  }

  const length = Math.min(highs.length, lows.length, closes.length);
  const result: number[] = new Array(length).fill(0);
  const trueRanges: number[] = new Array(length).fill(0);

  for (let i = 0; i < length; i += 1) {
    if (i === 0) {
      trueRanges[i] = highs[i] - lows[i];
      continue;
    }

    const highLow = highs[i] - lows[i];
    const highClose = Math.abs(highs[i] - closes[i - 1]);
    const lowClose = Math.abs(lows[i] - closes[i - 1]);
    trueRanges[i] = Math.max(highLow, highClose, lowClose);
  }

  let trSum = 0;
  for (let i = 0; i < length; i += 1) {
    trSum += trueRanges[i];
    if (i === period - 1) {
      result[i] = trSum / period;
    } else if (i >= period) {
      result[i] = (result[i - 1] * (period - 1) + trueRanges[i]) / period;
    }
  }

  return result;
}

export function macd(
  values: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): { macdLine: number[]; signalLine: number[]; histogram: number[] } {
  if (values.length === 0) {
    return { macdLine: [], signalLine: [], histogram: [] };
  }

  const emaFast = ema(values, fastPeriod);
  const emaSlow = ema(values, slowPeriod);
  const macdLine = values.map((_, index) => emaFast[index] - emaSlow[index]);
  const signalLine = ema(macdLine, signalPeriod);
  const histogram = macdLine.map((value, index) => value - signalLine[index]);

  return { macdLine, signalLine, histogram };
}
