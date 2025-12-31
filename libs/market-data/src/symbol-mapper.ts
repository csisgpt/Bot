// libs/market-data/src/symbol-mapper.ts

export interface CanonicalSymbol {
  base: string;
  quote: string;
}

/**
 * تشخیص اینکه نماد سهم (Equity) است یا نه
 * مثل: AAPLUSD, MSFTUSD, SPYUSD
 */
export const isEquity = (s: CanonicalSymbol): boolean => {
  return s.quote === 'USD' && s.base.length <= 5;
};

/**
 * شکستن نماد Canonical مثل BTCUSDT → { base: BTC, quote: USDT }
 */
export const applyQuoteRules = (symbol: string): CanonicalSymbol | null => {
  const QUOTES = ['USDT', 'USDC', 'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'IRT'];

  for (const q of QUOTES) {
    if (symbol.endsWith(q)) {
      return {
        base: symbol.slice(0, symbol.length - q.length),
        quote: q,
      };
    }
  }

  return null;
};

/**
 * پارس override ها
 * مثال:
 *   EURUSD:EUR/USD,AAPLUSD:AAPL
 */
const parseOverrides = (raw?: string): Record<string, string> => {
  if (!raw) return {};
  return Object.fromEntries(
    raw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .map((pair) => pair.split(':').map((x) => x.trim()))
      .filter((x) => x.length === 2),
  );
};

/**
 * تبدیل نماد Canonical به نماد provider
 */
export const providerSymbolFromCanonical = (
  provider: string,
  canonicalSymbol: string,
  overrides?: string,
): string | null => {
  const overrideMap = parseOverrides(overrides);
  if (overrideMap[canonicalSymbol]) {
    return overrideMap[canonicalSymbol];
  }

  const ruled = applyQuoteRules(canonicalSymbol);
  if (!ruled) return null;

  /**
   * ⛔️ TwelveData
   * فقط:
   *   - Forex (EUR/USD, GBP/USD, ...)
   *   - Metals (XAU/USD, XAG/USD)
   *   - Stocks (AAPL, MSFT, ...)
   *
   * ❌ Crypto (USDT / USDC)
   * ❌ Iran (IRT)
   */
  if (provider === 'twelvedata') {
    if (ruled.quote === 'IRT') return null;
    if (ruled.quote === 'USDT' || ruled.quote === 'USDC') return null;

    // Stock
    if (isEquity(ruled)) {
      return ruled.base;
    }

    // Forex / Metals
    return `${ruled.base}/${ruled.quote}`;
  }

  /**
   * Default (Binance / OKX / Kraken / ...)
   */
  return `${ruled.base}${ruled.quote}`;
};