import { InstrumentMapping } from '../models';
import { parseOverrides } from '../utils/overrides.util';

// Quote های استاندارد
const QUOTE_ASSETS = ['USDT', 'USDC', 'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'TRY', 'AED', 'IRT', 'IRR'];

// تمایز سهام در TwelveData
const isEquity = (symbol: { base: string; quote: string }) => {
  // اگر quote از بین ارزهای معروف نباشد، آن را equity در نظر بگیر
  return !QUOTE_ASSETS.includes(symbol.quote);
};

export interface SplitSymbol {
  base: string;
  quote: string;
}

/**
 * تقسیم سمبل به base/quote از روی convention
 */
export const applyQuoteRules = (symbol: string): SplitSymbol | null => {
  if (!symbol || typeof symbol !== 'string') return null;
  const s = symbol.trim().toUpperCase();

  for (const q of QUOTE_ASSETS) {
    if (s.endsWith(q) && s.length > q.length) {
      const base = s.slice(0, -q.length);
      return { base, quote: q };
    }
  }
  return null;
};

/**
 * نگاشت سمبل canonical به provider-specific
 * با در نظر گرفتن overrideها
 */
export const providerSymbolFromCanonical = (
  provider: string,
  canonicalSymbol: string,
  overrides?: string,
): string | null => {
  const overrideMap = parseOverrides(overrides);
  const override = overrideMap[canonicalSymbol];
  if (override) return override;

  const ruled = applyQuoteRules(canonicalSymbol);
  if (!ruled) return null;

  // ⚙️ فیلتر مخصوص TwelveData برای جلوگیری از خراب شدن batch
  if (provider === 'twelvedata') {
    // ۱. فقط quoteهای فیات مجاز هستند
    if (['IRT', 'IRR'].includes(ruled.quote)) return null;
    if (['USDT', 'USDC'].includes(ruled.quote)) return null;
  }

  // 🔹 Provider-specific formats
  switch (provider) {
    case 'twelvedata':
      // سهام یا شاخص‌ها بدون quote می‌آیند
      if (isEquity(ruled)) return ruled.base;
      return `${ruled.base}/${ruled.quote}`;

    case 'navasan':
      return ruled.base.toLowerCase();

    case 'brsapi_market':
      return ruled.base.toUpperCase();

    case 'bonbast':
      return ruled.base.toLowerCase();

    case 'binance':
    case 'okx':
    case 'bybit':
    case 'kraken':
    case 'coinbase':
      return `${ruled.base}${ruled.quote}`;

    default:
      return canonicalSymbol;
  }
};

/**
 * ساخت mapping برای همه providerها بر اساس overrides و symbol list
 */
export const mapSymbolsForProviders = (
  providers: string[],
  symbols: string[],
  overridesByProvider: Record<string, string | undefined>,
): InstrumentMapping[] => {
  const result: InstrumentMapping[] = [];

  for (const provider of providers) {
    const overrides = overridesByProvider[provider];
    for (const canonicalSymbol of symbols) {
      const providerSymbol = providerSymbolFromCanonical(provider, canonicalSymbol, overrides);
      if (!providerSymbol) continue;

      result.push({
        canonicalSymbol,
        provider,
        providerInstId: providerSymbol,
      });
    }
  }

  return result;
};