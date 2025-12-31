import { InstrumentMapping, MarketType } from './models';

/**
 * Normalize any input into canonical SYMBOL format.
 * This function MUST be defensive: input may NOT be string.
 */
export function normalizeCanonicalSymbol(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw.trim().toUpperCase();
  }

  if (typeof raw === 'number') {
    return String(raw);
  }

  if (raw && typeof raw === 'object') {
    // common patterns
    if ('symbol' in raw && typeof (raw as any).symbol === 'string') {
      return (raw as any).symbol.trim().toUpperCase();
    }

    if ('canonicalSymbol' in raw && typeof (raw as any).canonicalSymbol === 'string') {
      return (raw as any).canonicalSymbol.trim().toUpperCase();
    }
  }

  // fallback (VERY IMPORTANT: never crash)
  return '';
}

/**
 * Split canonical symbol into base/quote
 * BTCUSDT → BTC / USDT
 * EURUSD → EUR / USD
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
    'BTC', 'ETH'
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
 * Build provider instrument mapping
 */
export function providerSymbolFromCanonical(
  provider: string,
  canonicalSymbol: unknown,
): InstrumentMapping | null {
  const normalized = normalizeCanonicalSymbol(canonicalSymbol);
  if (!normalized) return null;

  return {
    provider,
    canonicalSymbol: normalized,
    providerSymbol: normalized,
    providerInstId: normalized,
    marketType: MarketType.SPOT,
    isActive: true,
  };
}