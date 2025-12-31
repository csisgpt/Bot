import { Instrument, InstrumentMapping } from './models';

/**
 * Canonical symbol format used across the project.
 *
 * - Crypto/FX: BTCUSDT, EURUSD
 * - Metals:    XAUUSD, XAUTUSDT, PAXGUSDT
 * - Iran:      USDIRT, GOLD18IRT
 */

// Order matters: longer suffixes first so we correctly parse e.g. USDC before USD.
const QUOTE_ASSETS = ['USDT', 'USDC', 'USD', 'EUR', 'GBP', 'BTC', 'ETH', 'IRT', 'IRR'] as const;
const QUOTE_ASSETS_SORTED = [...QUOTE_ASSETS].sort((a, b) => b.length - a.length);

const BASE_ALIASES: Record<string, string> = {
  XBT: 'BTC',
  XETH: 'ETH',
};

const PROVIDER_UNSUPPORTED_QUOTES: Record<string, string[]> = {
  // Coinbase: USDT markets are inconsistent; treat as unsupported by default.
  coinbase: ['USDT'],
  // kraken: ['USDT'],
};

export const splitCanonicalSymbol = (canonicalSymbol: string): { base: string; quote: string } => {
  const cleaned = cleanupSymbol(canonicalSymbol);
  // best-effort suffix matching
  for (const quote of QUOTE_ASSETS_SORTED) {
    if (cleaned.endsWith(quote)) {
      return { base: cleaned.slice(0, -quote.length), quote };
    }
  }
  // fallback (unknown quote)
  return { base: cleaned, quote: '' };
};

/**
 * Normalize canonical-ish symbols.
 *
 * Overloads:
 * - normalizeCanonicalSymbol(symbol) => string (never null)
 * - normalizeCanonicalSymbol(provider, providerSymbol) => string | null
 */
export function normalizeCanonicalSymbol(symbol: string): string;
export function normalizeCanonicalSymbol(provider: string, symbol: string): string | null;
export function normalizeCanonicalSymbol(a: string, b?: string): string | null {
  // 1-arg call: treat input as canonical already
  if (b === undefined) {
    return cleanupSymbol(a);
  }

  const provider = String(a ?? '').toLowerCase();
  const raw = String(b ?? '');
  if (!raw) return null;

  // If caller already gave us something like "EUR/USD" or "BTC-USDT"
  // we parse it directly.
  const direct = parseDelimitedPair(raw);
  if (direct) {
    const base = normalizeAssetCode(provider, direct.base);
    const quote = normalizeAssetCode(provider, direct.quote);
    return base && quote ? `${base}${quote}` : null;
  }

  // Provider-specific parsing
  if (provider === 'kraken') {
    const maybe = normalizeKrakenPair(raw);
    if (maybe) return maybe;
  }

  // Generic suffix-based parsing (BTCUSDT, XAUTUSDT, USDIRT, ...)
  const cleaned = cleanupSymbol(raw);
  const pair = parseSuffixPair(cleaned);
  if (!pair) return null;

  const base = normalizeAssetCode(provider, pair.base);
  const quote = normalizeAssetCode(provider, pair.quote);
  return base && quote ? `${base}${quote}` : null;
}

/**
 * Given a provider and a canonical symbol, produce providerSymbol/providerInstId.
 * Supports per-provider overrides.
 */
export const providerSymbolFromCanonical = (params: {
  provider: string;
  canonicalSymbol: string;
  overrides?: Record<string, string>;
}): InstrumentMapping => {
  const { provider, canonicalSymbol, overrides } = params;
  const normalized = normalizeCanonicalSymbol(canonicalSymbol);
  const ov = overrides?.[normalized];
  if (ov) {
    return {
      provider,
      canonicalSymbol: normalized,
      providerSymbol: ov,
      providerInstId: ov,
    };
  }

  const { base, quote } = splitCanonicalSymbol(normalized);
  const unsupported = PROVIDER_UNSUPPORTED_QUOTES[provider]?.includes(quote) ?? false;
  if (unsupported) {
    return {
      provider,
      canonicalSymbol: normalized,
      providerSymbol: '',
      providerInstId: '',
    };
  }

  if (provider === 'coinbase') {
    // Coinbase uses BASE-QUOTE
    const pair = `${base}-${quote}`;
    return { provider, canonicalSymbol: normalized, providerSymbol: pair, providerInstId: pair };
  }

  if (provider === 'okx') {
    // OKX spot uses BASE-QUOTE (instId)
    const pair = `${base}-${quote}`;
    return { provider, canonicalSymbol: normalized, providerSymbol: pair, providerInstId: pair };
  }

  if (provider === 'kraken') {
    // Kraken prefers XBT / USD style, but their WS/REST can accept multiple.
    const krBase = base === 'BTC' ? 'XBT' : base;
    const pair = `${krBase}${quote}`;
    return { provider, canonicalSymbol: normalized, providerSymbol: pair, providerInstId: pair };
  }

  // Default: concatenated
  const pair = `${base}${quote}`;
  return { provider, canonicalSymbol: normalized, providerSymbol: pair, providerInstId: pair };
};

/**
 * Build an Instrument object from a canonical symbol.
 * This keeps backward compatibility with older code paths.
 */
export const buildInstrumentFromSymbol = (canonicalSymbol: string): Instrument => {
  const normalized = normalizeCanonicalSymbol(canonicalSymbol);
  const { base, quote } = splitCanonicalSymbol(normalized);

  const assetType = isGoldLike(base, normalized) ? 'GOLD' : 'CRYPTO';
  const id = `${base}${quote}`;

  return {
    id,
    assetType,
    canonicalSymbol: normalized,
    baseAsset: base,
    quoteAsset: quote,
  };
};

/**
 * Normalize an Instrument by normalizing its canonicalSymbol and derived fields.
 */
export const normalizeInstrument = (provider: string, instrument: Instrument): Instrument => {
  // Instrument in this repo uses canonicalSymbol; however older code might have `symbol`.
  const anyInst = instrument as unknown as { canonicalSymbol?: string; symbol?: string };
  const rawSymbol = anyInst.canonicalSymbol ?? anyInst.symbol ?? '';

  const canonical = normalizeCanonicalSymbol(provider, rawSymbol) ?? normalizeCanonicalSymbol(rawSymbol);
  const { base, quote } = splitCanonicalSymbol(canonical);

  return {
    ...instrument,
    canonicalSymbol: canonical,
    baseAsset: base,
    quoteAsset: quote,
  };
};

// -----------------
// Internal helpers
// -----------------

const cleanupSymbol = (s: string): string => {
  return String(s)
    .trim()
    .toUpperCase()
    // drop common separators and whitespace
    .replace(/[\s\-_/.:]+/g, '')
    // keep only A-Z0-9
    .replace(/[^A-Z0-9]/g, '');
};

const parseDelimitedPair = (raw: string): { base: string; quote: string } | null => {
  const s = String(raw).trim().toUpperCase();
  const m = s.match(/^([A-Z0-9]{2,12})\s*[-_/]\s*([A-Z0-9]{2,12})$/);
  if (!m) return null;
  return { base: m[1], quote: m[2] };
};

const parseSuffixPair = (cleaned: string): { base: string; quote: string } | null => {
  for (const quote of QUOTE_ASSETS_SORTED) {
    if (cleaned.endsWith(quote) && cleaned.length > quote.length) {
      return { base: cleaned.slice(0, -quote.length), quote };
    }
  }
  return null;
};

const normalizeAssetCode = (provider: string, code: string): string | null => {
  if (!code) return null;
  let s = cleanupSymbol(code);

  // Kraken sometimes prefixes base/quote with X/Z (e.g., XXBT, ZUSD)
  if (provider === 'kraken') {
    // Drop one leading X/Z when the remaining looks like an asset code.
    if (/^[XZ][A-Z0-9]{2,6}$/.test(s)) {
      const candidate = s.slice(1);
      // Heuristic: keep if candidate is known-ish (USD/EUR/GBP/JPY/...) or length >= 3
      if (candidate.length >= 3) s = candidate;
    }
  }

  if (BASE_ALIASES[s]) s = BASE_ALIASES[s];
  return s || null;
};

const normalizeKrakenPair = (raw: string): string | null => {
  const s = cleanupSymbol(raw);

  // Common kraken formats:
  // - XBTUSD, XXBTZUSD, XETHZUSD, XXRPZUSD, etc.
  // We'll try suffix quote matching first.
  const pair = parseSuffixPair(s);
  if (!pair) return null;

  const base = normalizeAssetCode('kraken', pair.base);
  const quote = normalizeAssetCode('kraken', pair.quote);
  return base && quote ? `${base}${quote}` : null;
};

const isGoldLike = (base: string, canonical: string): boolean => {
  const b = cleanupSymbol(base);
  const c = cleanupSymbol(canonical);
  // Common tokens we use across the project.
  return ['XAU', 'XAUT', 'PAXG'].some((t) => b === t || c.startsWith(t));
};
