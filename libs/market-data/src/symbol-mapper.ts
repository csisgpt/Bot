import { Instrument } from './models';

/**
 * Canonical symbols are normalized as:
 *   BASEQUOTE (e.g., BTCUSDT, ETHUSD, XAUUSD, USDIRT)
 *
 * We support overrides for provider-specific symbols:
 *   format: "CANONICAL:providerSymbol,CANONICAL2:providerSymbol2"
 *   example: "USDIRT:usd_sell,BTCUSDT:BTC-USDT"
 */

const QUOTE_ASSETS = ['USDT', 'USDC', 'IRR', 'IRT', 'USD', 'EUR', 'GBP', 'BTC', 'ETH'] as const;

type QuoteAsset = (typeof QUOTE_ASSETS)[number];

const BASE_ALIASES: Record<string, string> = {
  XBT: 'BTC',
  XETH: 'ETH',
};

export interface ProviderSymbolMapping {
  providerSymbol: string;
  providerInstId: string;
}

export const parseOverrides = (raw?: string): Record<string, string> => {
  const map: Record<string, string> = {};
  if (!raw) return map;

  raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [canonical, providerSymbol] = pair.split(':').map((x) => x?.trim());
      if (!canonical || !providerSymbol) return;
      map[canonical.toUpperCase()] = providerSymbol;
    });

  return map;
};

const stripSeparators = (s: string): string => s.replace(/[-_/:]/g, '').toUpperCase();

export const splitCanonicalSymbol = (canonical: string): { base: string; quote: QuoteAsset | null } => {
  const sym = stripSeparators(canonical);

  // try to split by known quote assets (longer first)
  const candidates = [...QUOTE_ASSETS].sort((a, b) => b.length - a.length);
  for (const q of candidates) {
    if (sym.endsWith(q)) {
      const base = sym.slice(0, -q.length);
      return { base: BASE_ALIASES[base] ?? base, quote: q };
    }
  }

  return { base: BASE_ALIASES[sym] ?? sym, quote: null };
};

const withDash = (base: string, quote: string): string => `${base}-${quote}`;
const withSlash = (base: string, quote: string): string => `${base}/${quote}`;
const concat = (base: string, quote: string): string => `${base}${quote}`;

/**
 * Map canonical -> provider symbol (and optional provider instrument id).
 * Returns null if it cannot be mapped.
 */
export const providerSymbolFromCanonical = (
  provider: string,
  canonicalSymbol: string,
  overrides?: Record<string, string>,
): ProviderSymbolMapping | null => {
  const canonical = stripSeparators(canonicalSymbol);
  const override = overrides?.[canonical];
  if (override) {
    return { providerSymbol: override, providerInstId: override };
  }

  const { base, quote } = splitCanonicalSymbol(canonical);
  if (!quote) return null;

  const b = base;
  const q = quote;

  switch (provider) {
    case 'binance':
    case 'bybit':
    case 'kucoin':
    case 'gateio':
      return { providerSymbol: concat(b, q), providerInstId: concat(b, q) };

    case 'okx':
      // OKX often uses BASE-QUOTE, but spot can also use BASE-QUOTE
      return { providerSymbol: withDash(b, q), providerInstId: withDash(b, q) };

    case 'kraken': {
      // Kraken uses XBT for BTC in many pairs, and sometimes ZUSD etc,
      // but for simplicity we use common "BASE/QUOTE" form. Provider adapter can handle translation if needed.
      const krakenBase = b === 'BTC' ? 'XBT' : b;
      return { providerSymbol: withSlash(krakenBase, q), providerInstId: withSlash(krakenBase, q) };
    }

    case 'coinbase':
      // Coinbase uses BASE-QUOTE
      return { providerSymbol: withDash(b, q), providerInstId: withDash(b, q) };

    case 'bitfinex':
      // Bitfinex often uses tBASEQUOTE (e.g., tBTCUSD). Adapter may add prefix, but keep mapping stable.
      return { providerSymbol: concat(b, q), providerInstId: concat(b, q) };

    case 'twelvedata':
      // TwelveData uses BASE/QUOTE
      return { providerSymbol: withSlash(b, q), providerInstId: withSlash(b, q) };

    case 'brsapi_market':
      // Example: USDIRT -> usd_sell (handled by overrides usually)
      // If no override, default to lowercase base/quote with underscore
      return { providerSymbol: `${b.toLowerCase()}_${q.toLowerCase()}`, providerInstId: `${b.toLowerCase()}_${q.toLowerCase()}` };

    case 'navasan':
    case 'bonbast':
      // These providers typically need explicit overrides due to custom keys.
      if (overrides?.[canonical]) {
        const v = overrides[canonical];
        return { providerSymbol: v, providerInstId: v };
      }
      return null;

    default:
      // default: provider expects BASEQUOTE
      return { providerSymbol: concat(b, q), providerInstId: concat(b, q) };
  }
};

export const buildInstrumentFromSymbol = (symbol: string): Instrument => {
  const canonical = stripSeparators(symbol);
  const { base, quote } = splitCanonicalSymbol(canonical);

  return {
    id: canonical,
    symbol: canonical,
    base,
    quote: quote ?? '',
  } as Instrument;
};