import { Instrument, ProviderInstrumentMapping } from './models';

const DEFAULT_QUOTES = ['USDT', 'USDC', 'USD', 'EUR', 'GBP', 'BTC', 'ETH', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD'] as const;

const BASE_ALIASES: Record<string, string> = {
  XBT: 'BTC',
  XETH: 'ETH',
};

type Parts = { base: string; quote: string };

const upper = (v: string) => String(v ?? '').trim().toUpperCase();

const safeSplit = (s: string): Parts | null => {
  const sym = normalizeCanonicalSymbol(s);
  if (!sym) return null;

  // If it was something like "EUR/USD" => "EURUSD" at this point.
  // We try to detect quote by suffix matching from known quotes.
  for (const q of DEFAULT_QUOTES) {
    if (sym.endsWith(q) && sym.length > q.length) {
      const base = sym.slice(0, sym.length - q.length);
      return { base, quote: q };
    }
  }

  // Fallback: cannot split reliably
  return null;
};

export const normalizeCanonicalSymbol = (input: string): string => {
  const v = upper(input);
  if (!v) return v;

  // remove separators: BTC-USDT, BTC/USDT, BTC_USDT => BTCUSDT
  const cleaned = v.replace(/[-/_:\s]/g, '');

  // apply base aliases if prefix matches
  for (const [alias, real] of Object.entries(BASE_ALIASES)) {
    if (cleaned.startsWith(alias)) {
      return real + cleaned.slice(alias.length);
    }
  }

  return cleaned;
};

export const splitCanonicalSymbol = (canonical: string): Parts => {
  const sym = normalizeCanonicalSymbol(canonical);
  const parts = safeSplit(sym);
  if (!parts) {
    // As a very safe fallback, treat whole as base and USD quote
    // (only used in places that just need "some" split; better than crashing)
    return { base: sym, quote: 'USD' };
  }
  return parts;
};

const envKey = (provider: string) => `MARKET_DATA_SYMBOL_OVERRIDES_${upper(provider)}`;

const parseOverrides = (raw?: string): Record<string, string> => {
  const map: Record<string, string> = {};
  if (!raw) return map;

  raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [left, right] = pair.split(':').map((x) => x?.trim());
      if (!left || !right) return;
      map[normalizeCanonicalSymbol(left)] = right;
    });

  return map;
};

const getPreferredQuote = (provider: string): string | null => {
  // e.g. MARKET_DATA_PREFERRED_QUOTE_COINBASE=USD
  const k = `MARKET_DATA_PREFERRED_QUOTE_${upper(provider)}`;
  const v = process.env[k];
  return v ? upper(v) : null;
};

const applyQuoteRules = (provider: string, parts: Parts): Parts | null => {
  let { base, quote } = parts;

  base = upper(base);
  quote = upper(quote);

  // Provider-specific stable fallback:
  // TwelveData: USDT/USDC are usually not what it wants; it’s mostly USD pairs.
  if (provider === 'twelvedata' && (quote === 'USDT' || quote === 'USDC')) {
    quote = 'USD';
  }

  // Generic preferred quote: if quote is stable and preferred exists, switch
  const preferred = getPreferredQuote(provider);
  const isStable = (q: string) => q === 'USDT' || q === 'USDC' || q === 'USD';

  if (preferred && isStable(quote) && quote !== preferred) {
    quote = preferred;
  }

  return { base, quote };
};

const toProviderSymbol = (provider: string, canonical: string): { providerSymbol: string; providerInstId?: string } | null => {
  const normalized = normalizeCanonicalSymbol(canonical);
  if (!normalized) return null;

  const overrides = parseOverrides(process.env[envKey(provider)]);
  const overridden = overrides[normalized];
  if (overridden) return { providerSymbol: overridden };

  const parts = safeSplit(normalized);
  if (!parts) {
    // If no split is possible, fallback to passing it through (some providers accept this)
    return { providerSymbol: normalized };
  }

  const ruled = applyQuoteRules(provider, parts);
  if (!ruled) return null;

  const { base, quote } = ruled;

  switch (provider) {
    case 'coinbase':
      // Coinbase often uses BASE-QUOTE
      return { providerSymbol: `${base}-${quote}` };

    case 'kraken':
      // Kraken is inconsistent; prefer overrides in env. Fallback to BASE/QUOTE
      return { providerSymbol: `${base}/${quote}` };

    case 'twelvedata':
      // TwelveData forex/crypto metals use BASE/QUOTE format
      return { providerSymbol: `${base}/${quote}` };

    default:
      // Most crypto exchanges accept BASEQUOTE
      return { providerSymbol: `${base}${quote}` };
  }
};

export const providerSymbolFromCanonical = (
  provider: string,
  canonicalSymbol: string,
): { providerSymbol: string; providerInstId?: string } | null => {
  return toProviderSymbol(provider, canonicalSymbol);
};

export const buildProviderMapping = (provider: string, canonicalSymbol: string): ProviderInstrumentMapping | null => {
  const normalized = normalizeCanonicalSymbol(canonicalSymbol);
  if (!normalized) return null;

  const mapped = providerSymbolFromCanonical(provider, normalized);
  if (!mapped?.providerSymbol) return null;

  return {
    canonicalSymbol: normalized,
    provider,
    providerSymbol: mapped.providerSymbol,
    providerInstId: mapped.providerInstId,
  };
};

export const buildInstrumentFromCanonicalSymbol = (params: {
  canonicalSymbol: string;
  assetType: string;
  displaySymbol?: string;
}): Instrument => {
  const canonicalSymbol = normalizeCanonicalSymbol(params.canonicalSymbol);
  const { base, quote } = splitCanonicalSymbol(canonicalSymbol);

  const displaySymbol =
    params.displaySymbol?.trim() ||
    (quote && quote !== 'USD' ? `${base}/${quote}` : canonicalSymbol);

  return {
    id: `${params.assetType}:${canonicalSymbol}`,
    assetType: params.assetType,
    canonicalSymbol,
    displaySymbol,
    base,
    quote,
    isActive: true,
    meta: { base, quote },
  };
};