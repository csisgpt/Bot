import { InstrumentMapping } from './models';

/**
 * Normalize any input into canonical SYMBOL format.
 */
export function normalizeCanonicalSymbol(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw.trim().toUpperCase();
  }

  if (typeof raw === 'number') {
    return String(raw);
  }

  if (raw && typeof raw === 'object') {
    if ('symbol' in raw && typeof (raw as any).symbol === 'string') {
      return (raw as any).symbol.trim().toUpperCase();
    }

    if ('canonicalSymbol' in raw && typeof (raw as any).canonicalSymbol === 'string') {
      return (raw as any).canonicalSymbol.trim().toUpperCase();
    }
  }

  return '';
}

/**
 * Split canonical symbol into base / quote
 */
export function splitCanonicalSymbol(raw: unknown): {
  base: string;
  quote: string;
} | null {
  const symbol = normalizeCanonicalSymbol(raw);
  if (!symbol) return null;

  const QUOTES = [
    'USDT', 'USDC', 'USD',
    'EUR', 'GBP', 'JPY',
    'IRT', 'IRR',
    'BTC', 'ETH',
  ];

  for (const quote of QUOTES) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return {
        base: symbol.slice(0, -quote.length),
        quote,
      };
    }
  }

  return null;
}

/**
 * Build InstrumentMapping from canonical symbol
 * ⚠️ Required by InstrumentRegistryService
 */
export function buildInstrumentFromSymbol(
  provider: string,
  rawSymbol: unknown,
): InstrumentMapping | null {
  const canonical = normalizeCanonicalSymbol(rawSymbol);
  if (!canonical) return null;

  return {
    provider,
    canonicalSymbol: canonical,
    providerSymbol: canonical,
    providerInstId: canonical,
    marketType: 'SPOT', // 👈 IMPORTANT: string, NOT enum
    isActive: true,
  };
}

/**
 * Alias used by some providers
 */
export const providerSymbolFromCanonical = buildInstrumentFromSymbol;