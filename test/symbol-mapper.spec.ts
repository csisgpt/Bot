import { describe, expect, it } from 'vitest';
import { providerSymbolFromCanonical } from '@libs/market-data';

describe('provider symbol mapping', () => {
  it('maps canonical symbols to provider formats', () => {
    expect(providerSymbolFromCanonical('okx', 'BTCUSDT')).toEqual({
      providerSymbol: 'BTC-USDT',
      providerInstId: 'BTC-USDT',
    });
    expect(providerSymbolFromCanonical('gateio', 'ETHUSDT')).toEqual({
      providerSymbol: 'ETH_USDT',
      providerInstId: 'ETH_USDT',
    });
    expect(providerSymbolFromCanonical('kraken', 'BTCUSDT')).toEqual({
      providerSymbol: 'XBT/USDT',
      providerInstId: 'XBTUSDT',
    });
    expect(providerSymbolFromCanonical('bitfinex', 'BTCUSDT')).toEqual({
      providerSymbol: 'tBTCUST',
      providerInstId: 'tBTCUST',
    });
    expect(providerSymbolFromCanonical('twelvedata', 'EURUSD')).toEqual({
      providerSymbol: 'EUR/USD',
      providerInstId: 'EUR/USD',
    });
    expect(providerSymbolFromCanonical('twelvedata', 'AAPLUSD')).toEqual({
      providerSymbol: 'AAPL',
      providerInstId: 'AAPL',
    });
  });

  it('returns null for unknown quotes', () => {
    expect(providerSymbolFromCanonical('okx', 'FOOBAR')).toBeNull();
  });

  it('maps navasan overrides', () => {
    expect(providerSymbolFromCanonical('navasan', 'USDIRT', 'USDIRT:usd_sell')).toEqual({
      providerSymbol: 'usd_sell',
      providerInstId: 'usd_sell',
    });
  });

  it('maps brsapi_market defaults and overrides', () => {
    expect(providerSymbolFromCanonical('brsapi_market', 'USDIRT')).toEqual({
      providerSymbol: 'USD',
      providerInstId: 'USD',
    });
    expect(providerSymbolFromCanonical('brsapi_market', 'SEKKEHIRT')).toEqual({
      providerSymbol: 'IR_COIN_EMAMI',
      providerInstId: 'IR_COIN_EMAMI',
    });
    expect(providerSymbolFromCanonical('brsapi_market', 'USDIRT', 'USDIRT:USDD')).toEqual({
      providerSymbol: 'USDD',
      providerInstId: 'USDD',
    });
  });

  it('requires bonbast overrides', () => {
    expect(providerSymbolFromCanonical('bonbast', 'USDIRT')).toBeNull();
    expect(providerSymbolFromCanonical('bonbast', 'USDIRT', 'USDIRT:usd1')).toEqual({
      providerSymbol: 'usd1',
      providerInstId: 'usd1',
    });
  });
});
