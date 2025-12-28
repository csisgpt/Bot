import { describe, expect, it, vi } from 'vitest';
import { MarketDataIngestService } from '../apps/worker/src/market-data-v3/market-data-ingest.service';

describe('legacy candle compat', () => {
  it('writes both market and legacy candles for binance when enabled', async () => {
    const configService = {
      get: vi.fn((key: string, def?: unknown) => {
        if (key === 'MARKET_DATA_INGEST_ENABLED') return true;
        if (key === 'MARKET_DATA_TICKER_TTL_SECONDS') return 120;
        if (key === 'MARKET_DATA_TIMEFRAMES') return ['1m'];
        if (key === 'LEGACY_CANDLE_COMPAT_ENABLED') return true;
        return def;
      }),
    };
    const prismaService = {
      marketCandle: { upsert: vi.fn().mockResolvedValue({}) },
      candle: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const redisService = { set: vi.fn().mockResolvedValue('OK') };
    const instrumentRegistry = { setActiveSymbols: vi.fn(), getInstruments: vi.fn().mockReturnValue([]) };
    const providerRegistry = { getEnabledProviders: vi.fn().mockReturnValue([]), startAll: vi.fn() };
    const activeSymbolsService = { resolveActiveSymbols: vi.fn().mockResolvedValue([]) };
    const marketDataQueue = { add: vi.fn().mockResolvedValue({}) };

    const service = new MarketDataIngestService(
      configService as any,
      prismaService as any,
      redisService as any,
      instrumentRegistry as any,
      providerRegistry as any,
      activeSymbolsService as any,
      marketDataQueue as any,
    );

    const candle = {
      provider: 'binance',
      canonicalSymbol: 'BTCUSDT',
      timeframe: '1m',
      openTime: Date.now(),
      open: 1,
      high: 2,
      low: 0.5,
      close: 1.5,
      volume: 100,
      isFinal: true,
    };

    await (service as any).handleCandle(candle);

    expect(prismaService.marketCandle.upsert).toHaveBeenCalledTimes(1);
    expect(prismaService.candle.upsert).toHaveBeenCalledTimes(1);
  });
});
