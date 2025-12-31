import { Instrument } from './models';

const QUOTE_ASSETS = ['USDT', 'USDC', 'USD', 'EUR', 'GBP', 'BTC', 'ETH', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK'];
const BASE_ALIASES: Record<string, string> = {
  XBT: 'BTC',
  XETH: 'ETH',
};

const PROVIDER_UNSUPPORTED_QUOTES: Record<string, string[]> = {
  coinbase: ['USDT'],
};

const parseOverrides = (raw?: string): Record<string, string> => {
  // format: "BTCUSDT:BTC-USD,ETHUSDT:ETH-USD"
  const map: Record<string, string> = {};
  if (!raw) return map;
  raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [canonical, providerSymbol] = pair.split(':').map((x) => x.trim());
      if (canonical && providerSymbol) map[canonical.toUpperCase()] = providerSymbol;
    });
  return map;
};

export const getSymbolOverridesByProvider = (
  provider: string,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> => {
  const key = `MARKET_DATA_SYMBOL_OVERRIDES_${provider.toUpperCase()}`;
  return parseOverrides(env[key]);
};

const splitCanonical = (canonical: string): { base: string; quote: string } | null => {
  const s = canonical.trim().toUpperCase();
  for (const q of QUOTE_ASSETS.sort((a, b) => b.length - a.length)) {
    if (s.endsWith(q) && s.length > q.length) {
      return { base: s.slice(0, -q.length), quote: q };
    }
  }
  // fallback for FX pairs like EURUSD (6 chars)
  if (s.length === 6) return { base: s.slice(0, 3), quote: s.slice(3, 6) };
  return null;
};

const applyAliases = (base: string): string => BASE_ALIASES[base] ?? base;

export const normalizeCanonicalSymbol = (raw: string): string => {
  if (!raw) return '';
  const s = raw.trim().toUpperCase();

  // allow "EUR/USD" and "XAU/USD"
  const slashClean = s.includes('/') ? s.replace('/', '') : s;

  // keep IRT symbols as-is (USDIRT etc)
  if (slashClean.endsWith('IRT')) return slashClean;

  const parts = splitCanonical(slashClean);
  if (!parts) return slashClean;

  const base = applyAliases(parts.base);
  return `${base}${parts.quote}`;
};

export const describeCanonicalSymbol = (canonical: string): {
  canonicalSymbol: string;
  displaySymbol: string;
  base: string;
  quote: string;
} | null => {
  const norm = normalizeCanonicalSymbol(canonical);
  const parts = splitCanonical(norm);
  if (!parts) return null;
  const { base, quote } = parts;
  const displaySymbol =
    norm.length === 6 || (quote.length === 3 && base.length === 3) ? `${base}/${quote}` : `${base}/${quote}`;
  return { canonicalSymbol: norm, displaySymbol, base, quote };
};

export const providerSymbolFromCanonical = (
  provider: string,
  canonicalSymbol: string,
  opts?: {
    overrides?: Record<string, string>;
    preferredQuoteForUnquoted?: string;
  },
): { providerSymbol: string; providerInstId?: string } | null => {
  const normalizedProvider = provider.toLowerCase();
  const canonical = normalizeCanonicalSymbol(canonicalSymbol);
  if (!canonical) return null;

  const overrides = opts?.overrides ?? {};
  const override = overrides[canonical.toUpperCase()];
  if (override) {
    const ov = override.trim();
    return { providerSymbol: ov.toUpperCase(), providerInstId: ov.toUpperCase() };
  }

  const parts = splitCanonical(canonical);
  if (!parts) return null;

  const base = applyAliases(parts.base);
  const quote = parts.quote;

  const unsupported = PROVIDER_UNSUPPORTED_QUOTES[normalizedProvider];
  if (unsupported?.includes(quote)) return null;

  // special providers that are *mapping-only* (must be overridden)
  if (normalizedProvider === 'navasan' || normalizedProvider === 'bonbast' || normalizedProvider === 'brsapi_market') {
    return null;
  }

  if (normalizedProvider === 'coinbase') {
    // Coinbase uses BASE-QUOTE and prefers USD
    const q = quote === 'USDT' ? opts?.preferredQuoteForUnquoted ?? 'USD' : quote;
    const sym = `${base}-${q}`.toUpperCase();
    return { providerSymbol: sym, providerInstId: sym };
  }

  if (normalizedProvider === 'kraken') {
    // Kraken usually supports "XBT/USD" style via overrides; default: BASE/QUOTE
    const sym = `${base}/${quote}`.toUpperCase();
    return { providerSymbol: sym, providerInstId: sym };
  }

  if (normalizedProvider === 'twelvedata') {
    // TwelveData:
    // - FX/Metals/Crypto: "EUR/USD", "XAU/USD", "BTC/USD" (usually via overrides)
    // - Equities/ETFs: "AAPL" (base only) — use override or infer when quote is fiat
    const isFiatQuote = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK'].includes(quote);
    const isCommodity = base === 'XAU' || base === 'XAG' || base === 'XPT' || base === 'XPD';
    const isEquity = isFiatQuote && !isCommodity && base.length >= 3 && base.length <= 6;

    if (isEquity) {
      const sym = base.toUpperCase();
      return { providerSymbol: sym, providerInstId: sym };
    }

    const sym = `${base}/${quote}`.toUpperCase();
    return { providerSymbol: sym, providerInstId: sym };
  }

  // default: keep canonical (e.g., BTCUSDT)
  return { providerSymbol: canonical.toUpperCase(), providerInstId: canonical.toUpperCase() };
};

export const buildInstrumentFromSymbol = (canonicalSymbol: string): Instrument | null => {
  const desc = describeCanonicalSymbol(canonicalSymbol);
  if (!desc) return null;

  return {
    canonicalSymbol: desc.canonicalSymbol,
    displaySymbol: desc.displaySymbol,
    assetType: desc.quote === 'IRT' ? 'IRAN' : 'GLOBAL',
    isActive: true,
    meta: { base: desc.base, quote: desc.quote },
  } as Instrument;
};
