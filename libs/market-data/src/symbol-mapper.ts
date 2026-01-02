import { Instrument } from './models';

const QUOTE_ASSETS = [
  'USDT',
  'USDC',
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
  'IRR',
  'IRT',
] as const;

type QuoteAsset = (typeof QUOTE_ASSETS)[number];

const BASE_ALIASES: Record<string, string> = {
  XBT: 'BTC',
  XETH: 'ETH',
};

const FX_CURRENCIES = new Set([
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CAD',
  'CHF',
  'AUD',
  'NZD',
]);

export const IRAN_QUOTES = new Set(['IRT', 'IRR']);
const CRYPTO_QUOTES = new Set(['USDT', 'USDC', 'BTC', 'ETH']);
const METALS = new Set(['XAU', 'XAG', 'XPT', 'XPD']);
const EXCHANGE_ONLY_PROVIDERS = new Set(['binance', 'bybit', 'okx']);
const CRYPTO_ONLY_PROVIDERS = new Set(['coinbase', 'kraken']);
const IRAN_ONLY_PROVIDERS = new Set(['navasan', 'bonbast', 'brsapi_market']);

export const EXCHANGE_PROVIDERS = new Set([
  'binance',
  'bybit',
  'okx',
  'coinbase',
  'kraken',
  'kucoin',
  'gateio',
  'mexc',
  'bitfinex',
  'bitstamp',
]);

export interface ProviderSymbolMapping {
  providerSymbol: string;
  providerInstId: string;
}

const normalizeProviderKey = (provider: string): string => String(provider || '').trim().toLowerCase();

const stripSeparators = (s: string): string =>
  s
    .trim()
    .toUpperCase()
    .replace(/^[A-Z]+:/, '') // BINANCE:BTCUSDT
    .replace(/[\/\-_ \t]/g, '')
    .replace(/[^A-Z0-9]/g, '');

export const keyOf = (raw: unknown): string => {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
};

export const splitBaseQuote = (
  rawSymbol: unknown,
): { base: string; quote: QuoteAsset } | null => {
  const s = keyOf(rawSymbol);
  if (!s) return null;
  const quotes = [...QUOTE_ASSETS].sort((a, b) => b.length - a.length);
  for (const q of quotes) {
    if (s.length > q.length && s.endsWith(q)) {
      const base = s.slice(0, -q.length);
      if (!base) return null;
      return { base, quote: q };
    }
  }
  if (s.length > 3 && s.endsWith('UST')) {
    const base = s.slice(0, -3);
    if (!base) return null;
    return { base, quote: 'USDT' };
  }
  return null;
};

export const providerCanHandle = (providerName: string, canonicalSymbol: string): boolean => {
  const provider = normalizeProviderKey(providerName);
  const split = splitBaseQuote(canonicalSymbol);
  if (!split) return true;

  const base = split.base;
  const quote = split.quote;
  const isIran = IRAN_QUOTES.has(quote);
  const isFx = FX_CURRENCIES.has(base) && FX_CURRENCIES.has(quote);
  const isMetals =
    METALS.has(base) || base.startsWith('XAU') || base.startsWith('XAG');
  const isEquity =
    quote === 'USD' && !FX_CURRENCIES.has(base) && base.length > 1 && base.length <= 6;
  const isCrypto =
    CRYPTO_QUOTES.has(quote) && !FX_CURRENCIES.has(base);

  if (IRAN_ONLY_PROVIDERS.has(provider)) {
    return isIran;
  }

  if (provider === 'twelvedata') {
    return !isIran && (isFx || isMetals || isEquity);
  }

  if (EXCHANGE_ONLY_PROVIDERS.has(provider)) {
    return isCrypto || canonicalSymbol === 'XAUTUSDT';
  }

  if (CRYPTO_ONLY_PROVIDERS.has(provider)) {
    return isCrypto;
  }

  if (EXCHANGE_PROVIDERS.has(provider)) {
    return isCrypto;
  }

  return true;
};

export const splitCanonicalSymbol = (
  rawCanonical: string,
): { base: string; quote: QuoteAsset } | null => {
  const s = stripSeparators(rawCanonical);
  if (!s) return null;

  // match longest quote first
  const quotes = [...QUOTE_ASSETS].sort((a, b) => b.length - a.length);
  for (const q of quotes) {
    if (s.length > q.length && s.endsWith(q)) {
      const base = s.slice(0, -q.length);
      if (!base) return null;
      return { base, quote: q };
    }
  }

  // Bitfinex USDT uses UST (tBTCUST)
  if (s.length > 3 && s.endsWith('UST')) {
    const base = s.slice(0, -3);
    if (!base) return null;
    return { base, quote: 'USDT' };
  }

  return null;
};

/**
 * Normalize raw input to canonical symbol (BTCUSDT, EURUSD, USDIRT, ...)
 * - uppercase
 * - remove separators
 * - apply base aliases (XBT->BTC, ...)
 * - try to recompose base+quote when possible
 */
export const normalizeCanonicalSymbol = (rawSymbol: unknown): string => {
  if (typeof rawSymbol !== 'string') return '';
  let s = stripSeparators(rawSymbol);
  if (!s) return '';

  const split = splitCanonicalSymbol(s);
  if (!split) return s;

  const base = BASE_ALIASES[split.base] ?? split.base;
  return `${base}${split.quote}`;
};

export const parseOverrides = (raw?: string): Record<string, string> => {
  const map: Record<string, string> = {};
  if (!raw) return map;

  raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [k, v] = pair.split(':').map((x) => x?.trim());
      if (!k || !v) return;
      map[keyOf(k)] = v;
    });

  return map;
};

const readEnvOverrides = (provider: string): Record<string, string> => {
  const key = `MARKET_DATA_SYMBOL_OVERRIDES_${normalizeProviderKey(provider).toUpperCase()}`;
  return parseOverrides(process.env[key]);
};

const readBrsApiAliasOverrides = (): Record<string, string> =>
  parseOverrides(process.env.MARKET_DATA_SYMBOL_OVERRIDES_BRSAPI);

const isTwelveDataEquityLike = (base: string, quote: string): boolean => {
  // AAPLUSD => AAPL (equity)
  if (quote !== 'USD') return false;
  if (FX_CURRENCIES.has(base)) return false;
  // basic heuristic for tickers
  return /^[A-Z.]{1,10}$/.test(base) && base.length >= 2;
};

const brsapiDefaults = (canonical: string): string | null => {
  // documented defaults (README + tests)
  switch (canonical) {
    case 'USDIRT':
      return 'USD';
    case 'EURIRT':
      return 'EUR';
    case 'SEKKEHIRT':
      return 'IR_COIN_EMAMI';
    case 'ABSHODEHIRT':
      return 'IR_GOLD_MELTED';
    case 'GOLD18IRT':
      return 'IR_GOLD_18K';
    default:
      return null;
  }
};

/**
 * Maps canonical symbol to provider symbol/instId
 * Signature matches tests:
 *   providerSymbolFromCanonical('navasan','USDIRT','USDIRT:usd_sell') => {providerSymbol:'usd_sell',providerInstId:'usd_sell'}
 */
export const providerSymbolFromCanonical = (
  provider: string,
  canonicalSymbol: string,
  overridesRaw?: string,
): ProviderSymbolMapping | null => {
  const p = normalizeProviderKey(provider);
  const canonical = normalizeCanonicalSymbol(canonicalSymbol);
  if (!canonical) return null;
  const canonicalKey = keyOf(canonical);

  const runtimeOverrides = parseOverrides(overridesRaw);
  const envOverrides = readEnvOverrides(p);

  // Special precedence for brsapi_market: primary > alias > overridesRaw > defaults
  if (p === 'brsapi_market') {
    const primary = parseOverrides(process.env.MARKET_DATA_SYMBOL_OVERRIDES_BRSAPI_MARKET);
    const alias = readBrsApiAliasOverrides();

    const hit =
      primary[canonicalKey] ??
      alias[canonicalKey] ??
      runtimeOverrides[canonicalKey] ??
      brsapiDefaults(canonical);

    if (!hit) return null;
    return { providerSymbol: hit, providerInstId: hit };
  }

  // Providers that REQUIRE overrides
  if (p === 'navasan' || p === 'bonbast') {
    const hit = runtimeOverrides[canonicalKey] ?? envOverrides[canonicalKey];
    if (!hit) return null;
    return { providerSymbol: hit, providerInstId: hit };
  }

  // Generic overrides (runtime overrides should win over env for most providers)
  const overrideHit = runtimeOverrides[canonicalKey] ?? envOverrides[canonicalKey];
  if (overrideHit) {
    return { providerSymbol: overrideHit, providerInstId: overrideHit };
  }

  const split = splitCanonicalSymbol(canonical);
  if (!split) return null;

  let base = BASE_ALIASES[split.base] ?? split.base;
  const quote = split.quote;

  switch (p) {
    case 'okx': {
      const inst = `${base}-${quote}`;
      return { providerSymbol: inst, providerInstId: inst };
    }

    case 'gateio': {
      const inst = `${base}_${quote}`;
      return { providerSymbol: inst, providerInstId: inst };
    }

    case 'kraken': {
      const kb = base === 'BTC' ? 'XBT' : base;
      return {
        providerSymbol: `${kb}/${quote}`,
        providerInstId: `${kb}${quote}`,
      };
    }

    case 'coinbase': {
      const inst = `${base}-${quote}`;
      return { providerSymbol: inst, providerInstId: inst };
    }

    case 'bitfinex': {
      const q = quote === 'USDT' ? 'UST' : quote;
      const inst = `t${base}${q}`;
      return { providerSymbol: inst, providerInstId: inst };
    }

    case 'twelvedata': {
      if (isTwelveDataEquityLike(base, quote)) {
        return { providerSymbol: base, providerInstId: base };
      }
      // forex/metals default
      return { providerSymbol: `${base}/${quote}`, providerInstId: `${base}/${quote}` };
    }

    // default spot exchanges: concat
    case 'binance':
    case 'bybit':
    case 'kucoin':
    case 'mexc':
    case 'bitstamp':
    case 'bitfinex': // already handled but safe
    default: {
      const inst = `${base}${quote}`;
      return { providerSymbol: inst, providerInstId: inst };
    }
  }
};

export const buildInstrumentFromSymbol = (rawSymbol: unknown): Instrument | null => {
  const canonical = normalizeCanonicalSymbol(rawSymbol);
  if (!canonical) return null;

  const split = splitCanonicalSymbol(canonical);
  if (!split) return null;

  const base = BASE_ALIASES[split.base] ?? split.base;
  const quote = split.quote;

  const assetType =
    base === 'XAU' ||
    base === 'XAG' ||
    base === 'XAUT' ||
    base === 'PAXG' ||
    canonical.includes('GOLD') ||
    canonical.includes('18AYAR') ||
    canonical.includes('GOLD18') ||
    canonical.includes('SEKKEH') ||
    canonical.includes('ABSHODEH')
      ? 'GOLD'
      : 'CRYPTO';

  return {
    id: `${base.toLowerCase()}-${quote.toLowerCase()}`,
    assetType,
    base,
    quote,
    canonicalSymbol: `${base}${quote}`,
    isActive: true,
  };
};
