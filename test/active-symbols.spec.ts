import { describe, expect, it, vi } from 'vitest';
import { ActiveSymbolsService } from '../apps/worker/src/market-data-v3/active-symbols.service';

describe('active symbols service', () => {
  it('falls back to env defaults when chat watchlists are empty', async () => {
    const configService = {
      get: vi.fn((key: string, def?: unknown) => {
        if (key === 'UNIVERSE_DEFAULT_SYMBOLS') {
          return ['btcusdt', 'ethusdt'];
        }
        if (key === 'UNIVERSE_MAX_SYMBOLS') {
          return 100;
        }
        return def;
      }),
    };
    const prismaService = {
      chatConfig: {
        findMany: vi.fn().mockResolvedValue([{ watchlist: [] }]),
      },
    };
    const redisService = { set: vi.fn().mockResolvedValue('OK') };

    const service = new ActiveSymbolsService(
      configService as any,
      prismaService as any,
      redisService as any,
    );

    const symbols = await service.resolveActiveSymbols();
    expect(symbols).toEqual(['BTCUSDT', 'ETHUSDT']);
    expect(redisService.set).toHaveBeenCalledWith(
      'md:active:symbols',
      JSON.stringify(['BTCUSDT', 'ETHUSDT']),
    );
  });
});
