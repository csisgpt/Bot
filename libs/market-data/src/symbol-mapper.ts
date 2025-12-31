import { Instrument } from './models';

const QUOTE_ASSETS = ['USDT', 'USDC', 'USD', 'EUR', 'GBP', 'BTC', 'ETH'];
const BASE_ALIASES: Record<string, string> = {
  XBT: 'BTC',
  XETH: 'ETH',
};

// Quotes that we treat as fiat for some providers (and TwelveData forex format BASE/QUOTE).
const FIAT_ASSETS = new Set(['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'CHF', 'AUD', 'NZD']);

// Commodity bases supported in common data providers (TwelveData uses BASE/QUOTE for these too)
const COMMODITY_BASES = new Set(['XAU', 'XAG', 'XPT', 'XPD']);

// TwelveData might provide some crypto as BASE/QUOTE (typically against USD/EUR),
// but NOT as stablecoin quotes like USDT/USDC. Keeping this explicit prevents
// accidental subscriptions like BTC/USDT that can lead to disconnects / empty results.
const TWELVEDATA_CRYPTO_BASES = new Set([
  'BTC',
  'ETH',
  'SOL',
  'XRP',
  'ADA',
  'DOGE',
  'TRX',
  'BNB',
  'XAUT',
]);

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
      const [k, v] = pair.split(':').map((x) => x.trim());
      if (k && v) map[k.toUpperCase()] = v;
    });
  return map;
};

const applyProviderQuoteRules = (
  provider: string,
  parts: { base: string; quote: string },
): { base: string; quote: string } => {
  const unsupported = PROVIDER_UNSUPPORTED_QUOTES[provider] ?? [];
  if (unsupported.includes(parts.quote)) {
    // If quote unsupported by provider, return as-is; caller can decide to skip or override.
    return parts;
  }
  return parts;
};

const splitCanonical = (canonicalSymbol: string): { base: string; quote: string } | null => {
  const sym = canonicalSymbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const q of QUOTE_ASSETS) {
    if (sym.endsWith(q)) {
      const base = sym.slice(0, sym.length - q.length);
      if (!base) return null;
      return { base, quote: q };
    }
  }
  return null;
};

export const providerSymbolFromCanonical = (provider: string, canonicalSymbol: string): string | null => {
  const parts = splitCanonical(canonicalSymbol);
  if (!parts) return null;

  const base = BASE_ALIASES[parts.base] ?? parts.base;
  const quote = parts.quote;
  const canon = `${base}${quote}`;

  const envKey = `MARKET_DATA_SYMBOL_OVERRIDES_${provider.toUpperCase()}`;
  const overrides = parseOverrides(process.env[envKey]);
  const overridden = overrides[canon];
  if (overridden) return overridden;

  // If provider doesn't support this quote and no override exists, skip.
  const unsupported = PROVIDER_UNSUPPORTED_QUOTES[provider] ?? [];
  if (unsupported.includes(quote)) return null;

  const ruled = applyProviderQuoteRules(provider, { base, quote });

  switch (provider) {
    case 'binance':
    case 'bybit':
    case 'okx':
    case 'coinbase':
    case 'kraken':
    case 'kcex':
      // Default for crypto exchanges: BASEQUOTE (or provider specific mapping via override)
      return `${ruled.base}${ruled.quote}`;

    case 'navasan':
    case 'brsapi_market':
    case 'bonbast':
      // These are *Iran market* providers; they do not support crypto/forex as generic symbols unless overridden.
      // We rely on overrides for IRT instruments.
      return null;

    case 'twelvedata': {
      // ---- IMPORTANT ----
      // TwelveData does NOT support stablecoin quotes like USDT/USDC for pricing.
      // Forex/metals usually: BASE/QUOTE (EUR/USD, XAU/USD)
      // Equities/ETFs usually: TICKER only (AAPL, SPY, QQQ)
      // Crypto if used is typically: BTC/USD, ETH/USD (BASE/QUOTE) — not BTC/USDT.
      //
      // So:
      // - If quote is not FIAT and no override was provided -> skip
      // - If base/quote are fiat -> forex style BASE/QUOTE
      // - If base is commodity and quote is fiat -> BASE/QUOTE
      // - If base looks like equity/ETF and quote is fiat -> base only
      // - If base is known crypto and quote is fiat -> BASE/QUOTE

      if (!FIAT_ASSETS.has(ruled.quote)) {
        // e.g. BTCUSDT, XAUTUSDT, ...
        return null;
      }

      // Forex pairs
      if (FIAT_ASSETS.has(ruled.base) && FIAT_ASSETS.has(ruled.quote)) {
        return `${ruled.base}/${ruled.quote}`;
      }

      // Commodities/metals
      if (COMMODITY_BASES.has(ruled.base) && FIAT_ASSETS.has(ruled.quote)) {
        return `${ruled.base}/${ruled.quote}`;
      }

      // Crypto on TwelveData (only when quoted in FIAT)
      if (TWELVEDATA_CRYPTO_BASES.has(ruled.base) && FIAT_ASSETS.has(ruled.quote)) {
        return `${ruled.base}/${ruled.quote}`;
      }

      // Equities/ETFs heuristic: quote is FIAT, base is NOT FIAT and NOT commodity and NOT crypto-base
      const isEquity =
        FIAT_ASSETS.has(ruled.quote) &&
        !FIAT_ASSETS.has(ruled.base) &&
        !COMMODITY_BASES.has(ruled.base) &&
        !TWELVEDATA_CRYPTO_BASES.has(ruled.base);

      return isEquity ? ruled.base : `${ruled.base}/${ruled.quote}`;
    }

    default:
      return null;
  }
};

export const canonicalFromProviderSymbol = (provider: string, providerSymbol: string): string | null => {
  const raw = providerSymbol.toUpperCase().trim();

  // TwelveData: could be "EUR/USD" (forex) OR "AAPL" (equity/ETF) OR "XAU/USD"
  if (provider === 'twelvedata') {
    if (raw.includes('/')) {
      const [b, q] = raw.split('/').map((x) => x.trim());
      if (!b || !q) return null;
      return `${b}${q}`;
    }
    // Equity-style (AAPL => AAPLUSD)
    return `${raw}USD`;
  }

  // Forex-like providers might use "EURUSD" already; for exchanges: "BTCUSDT"
  const parts = splitCanonical(raw);
  if (parts) {
    return `${parts.base}${parts.quote}`;
  }

  return null;
};

export const normalizeCanonicalSymbol = (provider: string, symbol: string): string | null => {
  const canonical = canonicalFromProviderSymbol(provider, symbol);
  if (!canonical) return null;

  const parts = splitCanonical(canonical);
  if (!parts) return null;

  const base = BASE_ALIASES[parts.base] ?? parts.base;
  return `${base}${parts.quote}`;
};

export const normalizeCanonicalInstrument = (provider: string, instrument: Instrument): Instrument | null => {
  const canonicalSymbol = normalizeCanonicalSymbol(provider, instrument.symbol);
  if (!canonicalSymbol) return null;
  return { ...instrument, symbol: canonicalSymbol };
};