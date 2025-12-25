import { describe, expect, it, vi } from 'vitest';
import {
  buildSignalDedupeKey,
  mapTradingViewPayloadToSignal,
  parseTradingViewPayload,
  Signal,
} from '@libs/signals';
import { TradingViewIngestProcessor } from '../apps/worker/src/queues/tradingview-ingest.processor';

describe('TradingView ingest', () => {
  it('maps TradingView JSON payload into a signal', () => {
    const signal = mapTradingViewPayloadToSignal(
      {
        signal: 'BUY',
        assetType: 'GOLD',
        instrument: 'XAUTUSDT',
        interval: '15m',
        strategy: 'tv_ema_rsi',
        price: '2345.5',
        time: '2024-01-01T00:00:00Z',
        tags: ['tv'],
      },
      {
        assetType: 'GOLD',
        instrument: 'XAUTUSDT',
        interval: '15m',
        strategy: 'tradingview',
      },
    );

    expect(signal.source).toBe('TRADINGVIEW');
    expect(signal.side).toBe('BUY');
    expect(signal.strategy).toBe('tv_ema_rsi');
    expect(signal.price).toBeCloseTo(2345.5);
  });

  it('parses text/plain JSON payloads', () => {
    const { payload } = parseTradingViewPayload('{"signal":"SELL","price":2100}');
    expect(payload.signal).toBe('SELL');
    expect(payload.price).toBe(2100);
  });

  it('includes source in dedupe keys', () => {
    const key = buildSignalDedupeKey({
      source: 'TRADINGVIEW',
      assetType: 'GOLD',
      instrument: 'XAUTUSDT',
      interval: '15m',
      strategy: 'tradingview',
      kind: 'ALERT',
      side: 'BUY',
      price: 1234,
      time: 1710000000000,
      confidence: 0,
      tags: ['tv'],
      reason: 'test',
    });

    expect(key).toContain('TRADINGVIEW');
  });

  it('fills missing price via price provider', async () => {
    const storeSignal = vi.fn();
    const addQueue = vi.fn();
    const processor = new TradingViewIngestProcessor(
      {
        get: (key: string, fallback?: string) => {
          const defaults: Record<string, string> = {
            TRADINGVIEW_DEFAULT_ASSET_TYPE: 'GOLD',
            TRADINGVIEW_DEFAULT_INSTRUMENT: 'XAUTUSDT',
            TRADINGVIEW_DEFAULT_INTERVAL: '15m',
            TRADINGVIEW_DEFAULT_STRATEGY: 'tradingview',
            BINANCE_INTERVAL: '15m',
          };
          return defaults[key] ?? fallback ?? '';
        },
      } as never,
      { storeSignal } as never,
      { isAllowed: async () => true } as never,
      {
        getFeed: () => ({
          getCandles: async () => [{ close: 2000 }],
        }),
      } as never,
      { add: addQueue } as never,
    );

    await processor.process({
      name: 'ingestTradingViewAlert',
      data: { payloadRaw: { signal: 'BUY', assetType: 'GOLD', instrument: 'XAUTUSDT' } },
    } as never);

    const storedSignal = storeSignal.mock.calls[0][0] as Signal;
    expect(storedSignal.price).toBe(2000);
    expect(addQueue).toHaveBeenCalled();
  });
});
