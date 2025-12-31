import { Instrument, MarketType } from './models';

/**
 * Canonical Symbol Rules (project-wide):
 * - Uppercase
 * - No separators: BTC/USDT, BTC-USDT, BTC_USDT => BTCUSDT
 * - Should be splittable into {base, quote} using known QUOTE_ASSETS
 *
 * IMPORTANT:
 * - This file MUST NOT throw on bad inputs (runtime safety).
 * - Our MarketType in models.ts is a string union, NOT an enum.
 */

const QUOTE_ASSETS = [
  // longest first (to avoid USD matching before USDT/USDC)
  'USDT',
  'USDC',
  'IRR',
  'IRT',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CAD',
  'CHF',
  'AUD',
  'NZD',
  'BTC',
  'ETH',
] as const;

const BASE_ALIASES: Record<string, string> = {
  XBT: 'BTC',
  XETH: 'ETH',
};

const PROVIDER_BASE_ALIASES: Record<string, Record<string, string>> = {
  // Kraken commonly uses XBT instead of BTC
  kraken: { BTC: 'XBT' },
};

const normalizeProviderKey = (provider: string): string =>
  String(provider || '').trim().toLowerCase();

/**
 * env override format:
 * MARKET_DATA_SYMBOL_OVERRIDES_<PROVIDER>=BTCUSDT:BTC-USDT,EURUSD:EUR/USD
 * keys are canonical symbols (after normalizeCanonicalSymbol)
 * values are provider-specific symbols/instIds
 */
const readOverrides = (provider: string): Record<string, string> => {
  const key = `MARKET_DATA_SYMBOL_OVERRIDES_${normalizeProviderKey(provider).toUpperCase()}`;
  const raw = process.env[key];
  if (!raw) return {};
  const map: Record<string, string> = {};

  raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [k, v] = pair.split(':').map((x) => x?.trim());
      if (!k || !v) return;
      map[normalizeCanonicalSymbol(k)] = v;
    });

  return map;
};

const applyBaseAliases = (base: string): string => BASE_ALIASES[base] ?? base;

const applyProviderBaseAliases = (provider: string, base: string): string => {
  const p = normalizeProviderKey(provider);
  const aliases = PROVIDER_BASE_ALIASES[p];
  return aliases?.[base] ?? base;
};

const cleanRawSymbolToUpper = (rawSymbol: unknown): string => {
  // Never throw. If it isn't a string, return empty (caller can handle).
  if (typeof rawSymbol !== 'string') return '';
  return rawSymbol.trim().toUpperCase();
};

/**
 * Normalize ANY raw input into a canonical symbol string.
 * Never returns null (so callers that assume string won't break),
 * and never throws (runtime safety).
 */
export const normalizeCanonicalSymbol = (rawSymbol: unknown): string => {
  const s0 = cleanRawSymbolToUpper(rawSymbol);
  if (!s0) return '';

  // Handle provider prefix like "BINANCE:BTCUSDT"
  const s1 = s0.includes(':') ? s0.split(':').pop()!.trim() : s0;

  // Remove common separators: "/", "-", "_", spaces
  const compact = s1.replace(/[\/\-_ \t]/g, '');

  // If it still contains weird characters, strip to alnum only
  const alnum = compact.replace(/[^A-Z0-9]/g, '');

  // Try to split and re-compose with base aliases (XBT=>BTC etc.)
  const split = splitCanonicalSymbol(alnum);
  if (!split) return alnum;

  const base = applyBaseAliases(split.base);
  const quote = split.quote;
  return `${base}${quote}`;
};

/**
 * Split canonical symbol into base/quote using known QUOTE_ASSETS suffix match.
 * Returns null if cannot be split reliably.
 *
 * NOTE: expects canonical-ish input (uppercase, no separators),
 * but will defensively normalize common separators anyway.
 */
export const splitCanonicalSymbol = (
  canonicalSymbol: string,
): { base: string; quote: string } | null => {
  if (!canonicalSymbol) return null;

  const raw = typeof canonicalSymbol === 'string' ? canonicalSymbol : '';
  const s = raw.trim().toUpperCase().replace(/[\/\-_ \t]/g, '').replace(/[^A-Z0-9]/g, '');

  if (!s) return null;

  for (const q of QUOTE_ASSETS) {
    if (s.endsWith(q)) {
      const base = s.slice(0, -q.length);
      if (!base) return null;
      return { base, quote: q };
    }
  }

  return null;
};

/**
 * Build an Instrument from ANY raw symbol.
 * Returns null if we can't split into base/quote.
 */
export const buildInstrumentFromSymbol = (rawSymbol: unknown): Instrument | null => {
  const canonical = normalizeCanonicalSymbol(rawSymbol);
  if (!canonical) return null;

  const split = splitCanonicalSymbol(canonical);
  if (!split) return null;

  const { base, quote } = split;

  // Heuristic assetType (models.ts uses `string`, so this is flexible)
  const assetType = inferAssetType(canonical, base, quote);

  // MarketType in models.ts is a string union, NOT an enum
  const marketType: MarketType = 'spot';

  return {
    canonicalSymbol: canonical,
    base,
    quote,
    marketType,
    assetType,
    isActive: true,
  };
};

const inferAssetType = (canonical: string, base: string, quote: string): string => {
  // Iran markets
  if (quote === 'IRT' || quote === 'IRR') {
    if (/(SEKKEH|ABSHODEH|GOLD18|18AYAR)/.test(canonical)) return 'gold';
    return 'fx';
  }

  // Metals / gold
  if (base === 'XAU' || base === 'XAG' || base === 'XAUT' || base === 'PAXG') return 'gold';
  if (/^XAU/.test(base) || /GOLD/.test(canonical)) return 'gold';

  // US equities/ETFs often look like AAPLUSD, SPYUSD, QQQUSD...
  if (quote === 'USD' && /^[A-Z.]{2,6}$/.test(base)) {
    // crude heuristic: if it's 2-6 letters and USD quote, treat as stock/etf
    if (['SPY', 'QQQ'].includes(base)) return 'etf';
    if (['AAPL', 'GOOGL', 'MSFT', 'NVDA', 'TSLA', 'AMZN'].includes(base)) return 'stock';
  }

  // FX majors often like EURUSD, GBPUSD...
  if (
    ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'CHF', 'AUD', 'NZD'].includes(quote) &&
    base.length === 3
  ) {
    return 'fx';
  }

  // default
  return 'crypto';
};

/**
 * Convert canonical symbol to provider symbol/instId string.
 * Returns null if cannot map.
 *
 * - Respects MARKET_DATA_SYMBOL_OVERRIDES_<PROVIDER>
 * - Applies provider-specific base aliases (e.g. kraken BTC->XBT)
 */
export const providerSymbolFromCanonical = (provider: string, canonicalSymbol: string): string | null => {
  const p = normalizeProviderKey(provider);
  const canonical = normalizeCanonicalSymbol(canonicalSymbol);
  if (!canonical) return null;

  const overrides = readOverrides(p);
  const hit = overrides[canonical];
  if (hit) return hit;

  const split = splitCanonicalSymbol(canonical);
  if (!split) return null;

  let base = split.base;
  const quote = split.quote;

  base = applyProviderBaseAliases(p, base);

  switch (p) {
    case 'okx':
      // OKX uses INST_ID like BTC-USDT
      return `${base}-${quote}`;

    case 'coinbase': {
      // Coinbase products like BTC-USD. If canonical quote is USDT, prefer USD if configured.
      const preferred = String(process.env.MARKET_DATA_PREFERRED_QUOTE_COINBASE || '').trim().toUpperCase();
      const q = preferred && quote === 'USDT' ? preferred : quote;
      return `${base}-${q}`;
    }

    case 'kraken':
      // Kraken often accepts "XBTUSD" style
      return `${base}${quote}`;

    case 'binance':
    case 'bybit':
    case 'kucoin':
    case 'kcex':
    default:
      // Default: no separator
      return `${base}${quote}`;
  }
};