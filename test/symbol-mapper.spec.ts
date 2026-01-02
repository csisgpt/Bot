import { describe, expect, it } from 'vitest';
import { keyOf, providerCanHandle, providerSymbolFromCanonical } from '@libs/market-data';

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

  it('uses brsapi_market override aliases with precedence', () => {
    const prevPrimary = process.env.MARKET_DATA_SYMBOL_OVERRIDES_BRSAPI_MARKET;
    const prevAlias = process.env.MARKET_DATA_SYMBOL_OVERRIDES_BRSAPI;

    process.env.MARKET_DATA_SYMBOL_OVERRIDES_BRSAPI = 'USDIRT:USD_ALIAS';
    expect(providerSymbolFromCanonical('brsapi_market', 'USDIRT')).toEqual({
      providerSymbol: 'USD_ALIAS',
      providerInstId: 'USD_ALIAS',
    });

    process.env.MARKET_DATA_SYMBOL_OVERRIDES_BRSAPI_MARKET = 'USDIRT:USD_PRIMARY';
    expect(providerSymbolFromCanonical('brsapi_market', 'USDIRT')).toEqual({
      providerSymbol: 'USD_PRIMARY',
      providerInstId: 'USD_PRIMARY',
    });

    if (prevPrimary === undefined) {
      delete process.env.MARKET_DATA_SYMBOL_OVERRIDES_BRSAPI_MARKET;
    } else {
      process.env.MARKET_DATA_SYMBOL_OVERRIDES_BRSAPI_MARKET = prevPrimary;
    }
    if (prevAlias === undefined) {
      delete process.env.MARKET_DATA_SYMBOL_OVERRIDES_BRSAPI;
    } else {
      process.env.MARKET_DATA_SYMBOL_OVERRIDES_BRSAPI = prevAlias;
    }
  });

  it('requires bonbast overrides', () => {
    expect(providerSymbolFromCanonical('bonbast', 'USDIRT')).toBeNull();
    expect(providerSymbolFromCanonical('bonbast', 'USDIRT', 'USDIRT:usd1')).toEqual({
      providerSymbol: 'usd1',
      providerInstId: 'usd1',
    });
  });

  it('normalizes override keys across separators', () => {
    expect(keyOf('AAPL/USD')).toBe('AAPLUSD');
    expect(keyOf('AAPLUSD')).toBe('AAPLUSD');
    expect(providerSymbolFromCanonical('twelvedata', 'AAPLUSD', 'AAPL/USD:AAPL')).toEqual({
      providerSymbol: 'AAPL',
      providerInstId: 'AAPL',
    });
    expect(providerSymbolFromCanonical('twelvedata', 'BTCUSDT', 'BTC/USDT:BTC/USDT')).toEqual({
      providerSymbol: 'BTC/USDT',
      providerInstId: 'BTC/USDT',
    });
  });

  it('filters exchange providers for Iran quotes', () => {
    expect(providerCanHandle('okx', 'GOLD18IRT')).toBe(false);
    expect(providerCanHandle('bybit', 'BTCUSDT')).toBe(true);
    expect(providerCanHandle('navasan', 'USDIRT')).toBe(true);
  });

  it('filters providers by asset class', () => {
    expect(providerCanHandle('twelvedata', 'BTCUSDT')).toBe(false);
    expect(providerCanHandle('twelvedata', 'EURUSD')).toBe(true);
    expect(providerCanHandle('twelvedata', 'AAPLUSD')).toBe(true);
    expect(providerCanHandle('twelvedata', 'XAUUSD')).toBe(true);
    expect(providerCanHandle('bybit', 'EURUSD')).toBe(false);
    expect(providerCanHandle('bybit', 'XAUTUSDT')).toBe(true);
  });
});
