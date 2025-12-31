import { Instrument, InstrumentMapping } from './models';

const QUOTE_ASSETS = [
  // IMPORTANT: longest first to avoid USD matching before USDT/USDC
  'USDT',
  'USDC',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'AUD',
  'CAD',
  'NZD',
  'SEK',
  'NOK',
  'TRY',
  'AED',
  'IRT',
  'IRR',
  'BTC',
  'ETH',
];

const BASE_ALIASES: Record<string, string> = {
  XBT: 'BTC',
  XETH: 'ETH',
};

const PROVIDER_UNSUPPORTED_QUOTES: Record<string, string[]> = {
  // Coinbase عملاً روی USDT برای همه جفت‌ها قابل اتکا نیست
  // (بسته به بازارها). بهتره پیش‌فرض USDT رو skip کنیم مگر override داده باشی.
  coinbase: ['USDT'],
  // Kraken هم USDT محدود/متفاوت است؛ اگر می‌خوای سخت‌گیر باشی:
  // kraken: ['USDT'],
};

const parseOverrides = (raw?: string): Record<string, string> => {
  // format: "BTCUSDT:BTC-USDT,ETHUSDT:ETH-USDT"
  const map: Record<string, string> = {};
  if (!raw) return map;
  raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [canonical, providerSymbol] = pair.split(':').map((x) => x.trim());
      if (canonical && providerSymbol) map[canonical] = providerSymbol;
    });
  return map;
};

export const normalizeCanonicalSymbol = (symbol: string): string => {
  const s = symbol.trim().toUpperCase();
  if (!s) return s;

  // Keep separators if user provided them, but normalize alias base.
  // "XBT/USD" -> "BTC/USD"
  if (s.includes('/')) {
    const [b, q] = s.split('/');
    const base = BASE_ALIASES[b] ?? b;
    return `${base}/${q}`;
  }
  if (s.includes('-')) {
    const [b, q] = s.split('-');
    const base = BASE_ALIASES[b] ?? b;
    return `${base}-${q}`;
  }

  return s;
};

export const splitCanonicalSymbol = (
  canonicalSymbol: string,
): { base: string; quote: string } | null => {
  const s = normalizeCanonicalSymbol(canonicalSymbol);

  // If user already uses separators.
  if (s.includes('/')) {
    const [b, q] = s.split('/');
    if (!b || !q) return null;
    return { base: BASE_ALIASES[b] ?? b, quote: q };
  }
  if (s.includes('-')) {
    const [b, q] = s.split('-');
    if (!b || !q) return null;
    return { base: BASE_ALIASES[b] ?? b, quote: q };
  }

  // Otherwise, suffix match using known quote assets.
  for (const quote of QUOTE_ASSETS) {
    if (s.endsWith(quote) && s.length > quote.length) {
      const rawBase = s.slice(0, -quote.length);
      const base = BASE_ALIASES[rawBase] ?? rawBase;
      return { base, quote };
    }
  }

  return null;
};

const isQuoteUnsupportedForProvider = (provider: string, quote: string): boolean => {
  const unsupported = PROVIDER_UNSUPPORTED_QUOTES[provider];
  return Array.isArray(unsupported) ? unsupported.includes(quote) : false;
};

const toProviderSymbol = (provider: string, base: string, quote: string): string => {
  switch (provider) {
    case 'binance':
    case 'bybit':
    case 'okx':
      return `${base}${quote}`;

    case 'coinbase': {
      // Coinbase uses '-' and sometimes different base tickers (e.g. BTC vs XBT handled above)
      return `${base}-${quote}`;
    }

    case 'kraken': {
      // Kraken often uses XBT instead of BTC, and separators
      const krakenBase = base === 'BTC' ? 'XBT' : base;
      return `${krakenBase}/${quote}`;
    }

    case 'twelvedata': {
      // TwelveData uses:
      // - FX/metals as "BASE/QUOTE" (e.g., EUR/USD, XAU/USD)
      // - equities/ETFs as ticker only (e.g., AAPL, SPY)
      if (base.length === 3 && quote.length === 3) {
        return `${base}/${quote}`;
      }
      return base;
    }

    default:
      return `${base}${quote}`;
  }
};

export const providerSymbolFromCanonical = (
  canonicalSymbol: string,
  provider: string,
): { base: string; quote: string; providerSymbol: string; providerInstId: string } | null => {
  const split = splitCanonicalSymbol(canonicalSymbol);
  if (!split) return null;

  const { base, quote } = split;

  if (isQuoteUnsupportedForProvider(provider, quote)) return null;

  const providerSymbol = toProviderSymbol(provider, base, quote);
  // keep providerInstId same unless you later need another id field
  return { base, quote, providerSymbol, providerInstId: providerSymbol };
};

export const buildInstrument = (canonicalSymbol: string, assetType: string): Instrument | null => {
  const split = splitCanonicalSymbol(canonicalSymbol);
  if (!split) return null;

  return {
    id: canonicalSymbol,
    canonicalSymbol,
    assetType,
    base: split.base,
    quote: split.quote,
    isActive: true,
  };
};

export const buildInstrumentMapping = (
  canonicalSymbol: string,
  provider: string,
  assetType: string,
  overrides?: Record<string, string>,
): InstrumentMapping | null => {
  const split = splitCanonicalSymbol(canonicalSymbol);
  if (!split) return null;

  if (isQuoteUnsupportedForProvider(provider, split.quote)) return null;

  const overrideSymbol = overrides?.[canonicalSymbol];
  const providerSymbol = overrideSymbol ?? toProviderSymbol(provider, split.base, split.quote);

  return {
    id: `${provider}:${canonicalSymbol}`,
    provider,
    assetType,
    canonicalSymbol,
    base: split.base,
    quote: split.quote,
    providerSymbol,
    providerInstId: providerSymbol,
    isActive: true,
    meta: { base: split.base, quote: split.quote },
  };
};

export const buildMappingsForProvider = (params: {
  provider: string;
  assetType: string;
  canonicalSymbols: string[];
  overridesRaw?: string;
}): InstrumentMapping[] => {
  const { provider, assetType, canonicalSymbols, overridesRaw } = params;
  const overrides = parseOverrides(overridesRaw);

  const mappings: InstrumentMapping[] = [];
  for (const symbol of canonicalSymbols) {
    const canonicalSymbol = normalizeCanonicalSymbol(symbol);
    const mapping = buildInstrumentMapping(canonicalSymbol, provider, assetType, overrides);
    if (mapping) mappings.push(mapping);
  }
  return mappings;
};