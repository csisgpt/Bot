import { Instrument } from './models';

const QUOTE_ASSETS = ['USDT', 'USDC', 'BTC', 'ETH'];

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
      return { base, quote };
    }
  }
  return null;
};

export const okxSymbolFromCanonical = (symbol: string): string | null => {
  const parts = splitCanonicalSymbol(symbol);
  if (!parts) {
    return null;
  }
  return `${parts.base}-${parts.quote}`;
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
