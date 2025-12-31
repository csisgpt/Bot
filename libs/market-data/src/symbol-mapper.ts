import { Instrument, InstrumentMapping, MarketType } from './models';

/**
 * Canonical symbol conventions used across the project:
 * - Prefer compact form: BTCUSDT, EURUSD, XAUUSD, USDIRT
 * - Also accept common provider formats: BTC/USDT, BTC-USDT, btcusdt, XBT/USD, EUR/USD
 *
 * This module is intentionally conservative:
 * - `normalizeCanonicalSymbol` always returns a string (never null) to keep
 *   downstream indexing/sets type-safe.
 * - Parsing helpers return `null` when they truly cannot split a symbol.
 */

// Quotes we support when parsing compact symbols (longest first matters).
const QUOTE_ASSETS = [
  'USDT',
  'USDC',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'CAD',
  'AUD',
  'NZD',
  'SEK',
  'BTC',
  'ETH',
  'IRT',
  'IRR',
] as const;

const BASE_ALIASES: Record<string, string> = {
  XBT: 'BTC',
  XETH: 'ETH',
};

const ETF_SYMBOLS = new Set(['SPY', 'QQQ']);

const stripSeparators = (raw: string): string =>
  raw
    .trim()
    .toUpperCase()
    .replace(/^\s+|\s+$/g, '')
    .replace(/[\s_]/g, '')
    .replace(/[-/]/g, '');

const applyBaseAliases = (token: string): string => BASE_ALIASES[token] ?? token;

/**
 * Split a symbol into base/quote.
 * Accepts:
 * - Slash or dash: EUR/USD, BTC-USDT, XBT/USD
 * - Compact: BTCUSDT, EURUSD, USDIRT
 */
export const splitCanonicalSymbol = (
  raw: string,
): { base: string; quote: string } | null => {
  const s = raw.trim().toUpperCase();
  if (!s) return null;

  // Delimited formats first.
  if (s.includes('/')) {
    const [b, q] = s.split('/');
    if (!b || !q) return null;
    return { base: applyBaseAliases(b), quote: q };
  }
  if (s.includes('-')) {
    const [b, q] = s.split('-');
    if (!b || !q) return null;
    return { base: applyBaseAliases(b), quote: q };
  }

  // Compact: find a known quote suffix.
  const compact = stripSeparators(s);
  for (const quote of QUOTE_ASSETS) {
    if (compact.length > quote.length && compact.endsWith(quote)) {
      const base = compact.slice(0, -quote.length);
      if (!base) return null;
      return { base: applyBaseAliases(base), quote };
    }
  }

  // If we can't split, treat the entire thing as base.
  return { base: applyBaseAliases(compact), quote: '' };
};

/**
 * Normalize any provider/canonical symbol to our canonical compact form.
 *
 * Overloads:
 * - normalizeCanonicalSymbol(symbol)
 * - normalizeCanonicalSymbol(provider, symbol)  (provider is kept for compatibility)
 */
export function normalizeCanonicalSymbol(symbol: string): string;
export function normalizeCanonicalSymbol(provider: string, symbol: string): string;
export function normalizeCanonicalSymbol(a: string, b?: string): string {
  const symbol = (b ?? a) || '';
  const parsed = splitCanonicalSymbol(symbol);
  if (!parsed) return stripSeparators(symbol);
  const base = applyBaseAliases(parsed.base);
  const quote = parsed.quote ? parsed.quote.toUpperCase() : '';
  return `${base}${quote}`;
}

/**
 * Human-friendly symbol (used mostly in messages/UI):
 * - BTCUSDT -> BTC/USDT
 * - EURUSD  -> EUR/USD
 */
export const prettySymbol = (symbol: string): string => {
  const canonical = normalizeCanonicalSymbol(symbol);
  const parsed = splitCanonicalSymbol(canonical);
  if (!parsed) return canonical;
  if (!parsed.quote) return parsed.base;
  return `${parsed.base}/${parsed.quote}`;
};

const inferAssetType = (base: string, quote: string): Instrument['assetType'] => {
  const b = base.toUpperCase();
  const q = quote.toUpperCase();

  if (b === 'XAU' || b === 'XAG' || b === 'XAUT' || b === 'PAXG') return 'GOLD';
  if (q === 'IRT' || q === 'IRR') return 'FX';

  // Likely crypto if it looks like a crypto quote/base.
  if (['USDT', 'USDC', 'BTC', 'ETH'].includes(q)) return 'CRYPTO';
  if (['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE', 'TRX', 'BNB', 'AVAX', 'DOT', 'MATIC'].includes(b)) {
    return 'CRYPTO';
  }

  // ETFs we explicitly track.
  if (ETF_SYMBOLS.has(b)) return 'ETF';

  // Forex pairs typically have 3-letter base/quote.
  if (b.length === 3 && q.length === 3) return 'FX';

  // Equities: common pattern BASE+USD, BASE+EUR...
  if (q && ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK'].includes(q)) return 'EQUITY';

  return 'UNKNOWN';
};

const inferMarketType = (_base: string, _quote: string): MarketType => {
  // For now everything we aggregate is effectively spot.
  return 'spot';
};

/**
 * Provider-specific symbol mapping from canonical symbol.
 * This is used by providers to subscribe / map incoming messages.
 */
export const providerSymbolFromCanonical = (
  provider: string,
  canonicalSymbol: string,
): InstrumentMapping | null => {
  const normalized = normalizeCanonicalSymbol(canonicalSymbol);
  const parts = splitCanonicalSymbol(normalized);
  if (!parts) return null;

  const base = parts.base;
  const quote = parts.quote;
  const p = provider.toLowerCase();

  // Helper to build mappings consistently.
  const mk = (providerSymbol: string, providerInstId?: string): InstrumentMapping => {
    const marketType = inferMarketType(base, quote);
    return {
      provider: p,
      canonicalSymbol: normalized,
      providerSymbol,
      providerInstId: providerInstId ?? providerSymbol,
      marketType,
      isActive: true,
    };
  };

  switch (p) {
    case 'binance': {
      // ws stream uses lowercase later, but canonical mapping stays uppercase.
      if (!quote) return null;
      return mk(`${base}${quote}`);
    }

    case 'bybit': {
      if (!quote) return null;
      return mk(`${base}${quote}`);
    }

    case 'okx': {
      if (!quote) return null;
      const instId = `${base}-${quote}`;
      return mk(instId, instId);
    }

    case 'coinbase': {
      if (!quote) return null;
      const productId = `${base}-${quote}`;
      return mk(productId, productId);
    }

    case 'kraken': {
      if (!quote) return null;
      // Kraken uses XBT for BTC. Some markets use XETH for ETH.
      const krBase = base === 'BTC' ? 'XBT' : base === 'ETH' ? 'XETH' : base;
      const pair = `${krBase}/${quote}`;
      return mk(pair, pair);
    }

    case 'twelvedata': {
      // TwelveData websocket for price supports:
      // - Forex/commodities: EUR/USD, XAU/USD
      // - Equities/ETFs: AAPL, SPY, QQQ
      if (!quote) return mk(base, base);

      // If base looks like an equity ticker, TwelveData expects just the ticker.
      // Heuristic: for USD-quoted tickers that are not 3-letter FX codes.
      if (quote === 'USD' && base.length <= 6 && !(base.length === 3 && quote.length === 3)) {
        return mk(base, base);
      }

      const pair = `${base}/${quote}`;
      return mk(pair, pair);
    }

    default: {
      // Default: keep canonical.
      if (!quote) return mk(base, base);
      return mk(`${base}${quote}`, `${base}${quote}`);
    }
  }
};

/**
 * Build a minimal Instrument object from a canonical symbol.
 * Used by the instrument registry to construct a universe of instruments.
 */
export const buildInstrumentFromSymbol = (
  canonicalSymbol: string,
  provider = 'universe',
): Instrument => {
  const normalized = normalizeCanonicalSymbol(canonicalSymbol);
  const parts = splitCanonicalSymbol(normalized) ?? { base: normalized, quote: '' };

  const base = parts.base;
  const quote = parts.quote;
  const assetType = inferAssetType(base, quote);

  return {
    id: `${provider}:${normalized}`,
    canonicalSymbol: normalized,
    base,
    quote,
    assetType,
    isActive: true,
  };
};
