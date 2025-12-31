import { Instrument } from './models';

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
  'TRY',
  'AED',
  'IRT',
  'IRR',
  'BTC',
  'ETH',
];

const FIAT_ASSETS = new Set([
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CHF',
  'AUD',
  'CAD',
  'TRY',
  'AED',
  'IRR',
  'IRT',
]);

const COMMODITY_BASES = new Set(['XAU', 'XAG', 'XPT', 'XPD']);

const BASE_ALIASES: Record<string, string> = {
  XBT: 'BTC',
  XETH: 'ETH',
};

const PROVIDER_UNSUPPORTED_QUOTES: Record<string, string[]> = {
  // Coinbase: USDT pair coverage is not reliable; prefer USD/USDC
  coinbase: ['USDT'],
};

type QuoteFallbackMap = Record<string, Record<string, string>>;
// provider -> { fromQuote -> toQuote }
const PROVIDER_QUOTE_FALLBACKS: QuoteFallbackMap = {
  // If canonical is BTCUSDT, coinbase can be BTC-USD or BTC-USDC depending on your preference
  coinbase: { USDT: 'USD' },
  // you can add more later if needed
};

const normalizeCanonicalSymbol = (symbol: string): string =>
  symbol
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

export { normalizeCanonicalSymbol };

const parseOverrides = (raw?: string): Record<string, string> => {
  // format: "BTCUSDT:BTC-USD,ETHUSDT:ETH-USD"
  const map: Record<string, string> = {};
  if (!raw) return map;

  raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [k, v] = pair.split(':').map((x) => x.trim());
      if (k && v) map[normalizeCanonicalSymbol(k)] = v;
    });

  return map;
};

const getSortedQuotes = (): string[] =>
  [...QUOTE_ASSETS].sort((a, b) => b.length - a.length);

export const splitCanonicalSymbol = (
  symbol: string,
): { base: string; quote: string } | null => {
  const normalized = normalizeCanonicalSymbol(symbol);

  for (const quote of getSortedQuotes()) {
    if (normalized.endsWith(quote)) {
      const baseRaw = normalized.slice(0, -quote.length);
      if (!baseRaw) return null;

      const base = BASE_ALIASES[baseRaw] ?? baseRaw;
      return { base, quote };
    }
  }
  return null;
};

const applyQuoteRules = (
  provider: string,
  base: string,
  quote: string,
  overridesHit: boolean,
  preferredQuote?: string,
): { base: string; quote: string } | null => {
  // If overridden, don't interfere
  if (overridesHit) return { base, quote };

  // If provider says quote unsupported, try fallback
  const isUnsupported = PROVIDER_UNSUPPORTED_QUOTES[provider]?.includes(quote);

  if (isUnsupported) {
    // 1) Preferred quote (env-driven) has priority if given
    if (preferredQuote) {
      return { base, quote: preferredQuote.toUpperCase() };
    }

    // 2) Provider fallback map
    const fb = PROVIDER_QUOTE_FALLBACKS[provider]?.[quote];
    if (fb) return { base, quote: fb };

    // 3) Otherwise skip
    return null;
  }

  return { base, quote };
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
      // Kraken WS usually uses XBT/USD
      return `${krakenBase}/${quote}`;
    }

    case 'gateio':
      return `${base}_${quote}`;

    case 'bitfinex': {
      // Bitfinex uses UST for USDT in some tickers (common normalization)
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
      // Kraken REST expects XBTUSD style pairs in many endpoints
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
  overridesRaw?: string,          // env: MARKET_DATA_SYMBOL_OVERRIDES_<PROVIDER>
  preferredQuoteRaw?: string,     // env: MARKET_DATA_PREFERRED_QUOTE_<PROVIDER>  (e.g. USD)
): { providerSymbol: string; providerInstId: string } | null => {
  const parts = splitCanonicalSymbol(symbol);
  if (!parts) return null;

  const providerKey = provider.toUpperCase();
  const overridesValue =
    overridesRaw ?? process.env[`MARKET_DATA_SYMBOL_OVERRIDES_${providerKey}`];
  const preferredQuoteValue =
    preferredQuoteRaw ?? process.env[`MARKET_DATA_PREFERRED_QUOTE_${providerKey}`];
  const overrides = parseOverrides(overridesValue);
  const canonical = normalizeCanonicalSymbol(symbol);
  const overridden = overrides[canonical];

  if (overridden) {
    return { providerSymbol: overridden, providerInstId: overridden };
  }

  if (provider === 'navasan') {
    return null;
  }

  if (provider === 'bonbast') {
    return null;
  }

  if (provider === 'brsapi_market') {
    const defaultMap: Record<string, string> = {
      USDIRT: 'USD',
      EURIRT: 'EUR',
      AEDIRT: 'AED',
      GBPIRT: 'GBP',
      SEKKEHIRT: 'IR_COIN_EMAMI',
      ABSHODEHIRT: 'IR_GOLD_MELTED',
      GOLD18IRT: 'IR_GOLD_18K',
      GOLD24IRT: 'IR_GOLD_24K',
    };
    const mapped = defaultMap[canonical];
    if (!mapped) {
      return null;
    }
    return { providerSymbol: mapped, providerInstId: mapped };
  }

  const ruled = applyQuoteRules(
    provider,
    parts.base,
    parts.quote,
    /* overridesHit */ false,
    preferredQuoteValue,
  );
  if (!ruled) return null;

  if (provider === 'twelvedata') {
    const isEquity =
      FIAT_ASSETS.has(ruled.quote) &&
      !FIAT_ASSETS.has(ruled.base) &&
      !COMMODITY_BASES.has(ruled.base);
    const providerSymbol = isEquity ? ruled.base : `${ruled.base}/${ruled.quote}`;
    return { providerSymbol, providerInstId: providerSymbol };
  }

  const providerSymbol = toProviderSymbol(provider, ruled.base, ruled.quote);
  const providerInstId = toProviderInstId(provider, ruled.base, ruled.quote);
  if (!providerSymbol || !providerInstId) return null;

  return { providerSymbol, providerInstId };
};

export const buildInstrumentFromSymbol = (symbol: string): Instrument | null => {
  const normalized = normalizeCanonicalSymbol(symbol);
  const parts = splitCanonicalSymbol(normalized);
  if (!parts) return null;

  const assetType = (() => {
    if (normalized === 'XAUTUSDT' || normalized === 'PAXGUSDT') {
      return 'GOLD';
    }
    if (parts.quote === 'IRT' || parts.quote === 'IRR') {
      return 'IRAN';
    }
    if (COMMODITY_BASES.has(parts.base)) {
      return 'COMMODITY';
    }
    if (FIAT_ASSETS.has(parts.base) && FIAT_ASSETS.has(parts.quote)) {
      return 'FOREX';
    }
    if (FIAT_ASSETS.has(parts.quote) && !FIAT_ASSETS.has(parts.base)) {
      return 'EQUITY';
    }
    return 'CRYPTO';
  })();

  return {
    id: `${parts.base.toLowerCase()}-${parts.quote.toLowerCase()}`,
    assetType,
    base: parts.base,
    quote: parts.quote,
    canonicalSymbol: normalized,
    isActive: true,
  };
};
