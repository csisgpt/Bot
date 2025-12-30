const ALIAS_MAP: Record<string, string> = {
  XBT: 'BTC',
  XETH: 'ETH',
  WBTC: 'BTC',
};

const QUOTE_ASSETS = ['USDT', 'USDC', 'USD', 'EUR', 'GBP', 'BTC', 'ETH'];

export const canonicalizeSymbol = (value: string): string => {
  const cleaned = value.toUpperCase().replace(/[-_/]/g, '');
  return ALIAS_MAP[cleaned] ?? cleaned;
};

export const splitSymbol = (value: string): { base: string; quote: string } | null => {
  const canonical = canonicalizeSymbol(value);
  const quote = QUOTE_ASSETS.find((asset) => canonical.endsWith(asset));
  if (!quote) {
    return null;
  }
  const base = canonical.slice(0, -quote.length);
  if (!base) {
    return null;
  }
  return { base: ALIAS_MAP[base] ?? base, quote };
};

export const joinSymbol = (value: string, separator: string): string => {
  const parts = splitSymbol(value);
  if (!parts) {
    return canonicalizeSymbol(value);
  }
  return `${parts.base}${separator}${parts.quote}`;
};

export const mapBaseAlias = (value: string, aliasMap: Record<string, string>): string => {
  const parts = splitSymbol(value);
  if (!parts) {
    return canonicalizeSymbol(value);
  }
  const base = aliasMap[parts.base] ?? parts.base;
  return `${base}${parts.quote}`;
};
