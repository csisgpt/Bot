import { Instrument } from './models';

const QUOTE_ASSETS = ['USDT', 'USDC', 'USD', 'EUR', 'GBP', 'BTC', 'ETH'];
const BASE_ALIASES: Record<string, string> = {
  XBT: 'BTC',
  XETH: 'ETH',
};

export const normalizeCanonicalSymbol = (symbol: string): string =>
  symbol
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

export const splitCanonicalSymbol = (
  symbol: string,
): { base: string; quote: string } | null => {
  const normalized = normalizeCanonicalSymbol(symbol);
  for (const quote of QUOTE_ASSETS) {
    if (normalized.endsWith(quote)) {
      const base = normalized.slice(0, -quote.length);
      if (!base) {
        return null;
      }
      return { base: BASE_ALIASES[base] ?? base, quote };
    }
  }
  return null;
};

const toProviderSymbol = (provider: string, base: string, quote: string): string | null => {
  switch (provider) {
    case 'binance':
    case 'bybit':
    case 'mexc':
      return `${base}${quote}`;
    case 'okx':
    case 'coinbase':
    case 'kucoin':
      return `${base}-${quote}`;
    case 'kraken': {
      const krakenBase = base === 'BTC' ? 'XBT' : base;
      return `${krakenBase}/${quote}`;
    }
    case 'gateio':
      return `${base}_${quote}`;
    case 'bitfinex': {
      const bitfinexQuote = quote === 'USDT' ? 'UST' : quote;
      return `t${base}${bitfinexQuote}`;
    }
    case 'bitstamp':
      return `${base}${quote}`.toLowerCase();
    default:
      return `${base}${quote}`;
  }
};

const toProviderInstId = (provider: string, base: string, quote: string): string | null => {
  switch (provider) {
    case 'kraken': {
      const krakenBase = base === 'BTC' ? 'XBT' : base;
      return `${krakenBase}${quote}`;
    }
    default:
      return toProviderSymbol(provider, base, quote);
  }
};

export const providerSymbolFromCanonical = (
  provider: string,
  symbol: string,
): { providerSymbol: string; providerInstId: string } | null => {
  const parts = splitCanonicalSymbol(symbol);
  if (!parts) {
    return null;
  }
  const providerSymbol = toProviderSymbol(provider, parts.base, parts.quote);
  const providerInstId = toProviderInstId(provider, parts.base, parts.quote);
  if (!providerSymbol || !providerInstId) {
    return null;
  }
  return { providerSymbol, providerInstId };
};

export const buildInstrumentFromSymbol = (symbol: string): Instrument | null => {
  const normalized = normalizeCanonicalSymbol(symbol);
  const parts = splitCanonicalSymbol(normalized);
  if (!parts) {
    return null;
  }
  return {
    id: `${parts.base.toLowerCase()}-${parts.quote.toLowerCase()}`,
    assetType: normalized === 'XAUTUSDT' || normalized === 'PAXGUSDT' ? 'GOLD' : 'CRYPTO',
    base: parts.base,
    quote: parts.quote,
    canonicalSymbol: normalized,
    isActive: true,
  };
};
