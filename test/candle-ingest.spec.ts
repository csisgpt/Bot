import { describe, expect, it } from 'vitest';
import { isClosedCandle } from '../apps/worker/src/market-data/candle-ingest.service';

describe('candle ingest helpers', () => {
  it('detects closed candles with guard', () => {
    const now = Date.now();
    const closed = isClosedCandle(
      {
        openTime: now - 120_000,
        open: 1,
        high: 2,
        low: 0.5,
        close: 1.5,
        volume: 10,
        closeTime: now - 2000,
      },
      now,
    );
    const open = isClosedCandle(
      {
        openTime: now - 60_000,
        open: 1,
        high: 2,
        low: 0.5,
        close: 1.5,
        volume: 10,
        closeTime: now,
      },
      now,
    );

    expect(closed).toBe(true);
    expect(open).toBe(false);
  });
});
