import { describe, expect, it, vi } from 'vitest';
import { BinanceWsService } from '@libs/binance';

describe('binance ws guard', () => {
  it('does not connect when market data v3 is enabled', () => {
    const configService = {
      get: vi.fn((key: string, def?: unknown) => {
        if (key === 'MARKET_DATA_INGEST_ENABLED') return true;
        if (key === 'BINANCE_WS_ENABLED') return true;
        if (key === 'PRICE_INGEST_ENABLED') return true;
        if (key === 'BINANCE_WS_RECONNECT_MS') return 1000;
        if (key === 'PRICE_CACHE_TTL_SECONDS') return 120;
        return def;
      }),
    };
    const redisService = { set: vi.fn() };
    const service = new BinanceWsService(configService as any, redisService as any);
    const connectSpy = vi.spyOn(service as any, 'connect');

    service.onModuleInit();

    expect(connectSpy).not.toHaveBeenCalled();
  });
});
