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
