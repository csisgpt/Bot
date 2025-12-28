import { describe, expect, it } from 'vitest';
import {
  normalizeBinanceBookTicker,
  normalizeBybitKline,
  normalizeOkxRestCandle,
  InstrumentRegistryService,
} from '@libs/market-data';

const mapping = {
  provider: 'binance',
  canonicalSymbol: 'BTCUSDT',
  providerSymbol: 'BTCUSDT',
  providerInstId: 'BTCUSDT',
  marketType: 'spot' as const,
  isActive: true,
};

describe('market data normalizers', () => {
  it('normalizes Binance bookTicker payload', () => {
    const payload = { s: 'BTCUSDT', b: '63000.5', a: '63001.1', E: 1710000000000 };
    const ticker = normalizeBinanceBookTicker(payload, mapping);
    expect(ticker).toEqual({
      provider: 'binance',
      canonicalSymbol: 'BTCUSDT',
      ts: 1710000000000,
      last: (63000.5 + 63001.1) / 2,
      bid: 63000.5,
      ask: 63001.1,
    });
  });

  it('normalizes Bybit kline payload', () => {
    const payload = {
      data: {
        start: 1710000000000,
        open: '100',
        high: '110',
        low: '95',
        close: '105',
        volume: '1234',
        confirm: true,
      },
    };
    const candle = normalizeBybitKline(payload, mapping, '1m');
    expect(candle).toEqual({
      provider: 'binance',
      canonicalSymbol: 'BTCUSDT',
      timeframe: '1m',
      openTime: 1710000000000,
      open: 100,
      high: 110,
      low: 95,
      close: 105,
      volume: 1234,
      isFinal: true,
    });
  });

  it('normalizes OKX REST candle payload', () => {
    const payload = ['1710000000000', '200', '210', '190', '205', '987'];
    const candle = normalizeOkxRestCandle(payload, mapping, '1m');
    expect(candle).toEqual({
      provider: 'binance',
      canonicalSymbol: 'BTCUSDT',
      timeframe: '1m',
      openTime: 1710000000000,
      open: 200,
      high: 210,
      low: 190,
      close: 205,
      volume: 987,
      isFinal: true,
    });
  });
});

describe('market data normalization integration', () => {
  it('maps seeded instrument and normalizes candle', () => {
    const registry = new InstrumentRegistryService();
    registry.setActiveSymbols(['BTCUSDT']);
    const [okxMapping] = registry.getMappingsForProvider('okx');
    const payload = ['1710000000000', '1', '2', '0.5', '1.5', '10'];
    const candle = normalizeOkxRestCandle(payload, okxMapping, '1m');

    expect(candle?.canonicalSymbol).toBe(okxMapping.canonicalSymbol);
    expect(candle?.provider).toBe(okxMapping.provider);
    expect(candle?.volume).toBe(10);
  });
});
