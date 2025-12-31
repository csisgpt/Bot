import { escapeHtml } from './formatting.utils';
import { normalizeCanonicalSymbol } from '@libs/market-data';

export interface PriceAggregation {
  symbol: string;
  entries: Array<{ provider: string; price: number }>;
  spreadPct?: number | null;
}

type PricesFeedFormat = 'table' | 'compact'; // برای سازگاری؛ "table" رو هم می‌گیریم ولی خروجی‌مون جدولی نیست.

const QUOTE_ASSETS = ['USDT', 'USDC', 'USD', 'EUR', 'GBP', 'BTC', 'ETH', 'IRT', 'IRR'] as const;

const PROVIDER_META: Record<string, { label: string; emoji: string }> = {
  binance: { label: 'Binance', emoji: '🟡' },
  bybit: { label: 'Bybit', emoji: '🟠' },
  okx: { label: 'OKX', emoji: '⚫️' },
  kucoin: { label: 'KuCoin', emoji: '🟢' },
  kraken: { label: 'Kraken', emoji: '🟣' },
  coinbase: { label: 'Coinbase', emoji: '🔵' },
  mexc: { label: 'MEXC', emoji: '🟦' },
  gate: { label: 'Gate', emoji: '🟥' },
  twelvedata: { label: 'TwelveData', emoji: '🟦' },
  navasan: { label: 'Navasan', emoji: '🟧' },
  brsapi_market: { label: 'BrsApi', emoji: '🟫' },
  bonbast: { label: 'Bonbast', emoji: '🟧' },
};

const normalizeProviderKey = (p: string) => p.trim().toLowerCase();

const providerDisplay = (provider: string): { text: string; emoji: string } => {
  const key = normalizeProviderKey(provider);
  const meta = PROVIDER_META[key];
  const safeLabel = escapeHtml(meta?.label ?? provider.trim());
  return { text: safeLabel, emoji: meta?.emoji ?? '🏦' };
};

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const formatPrice = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);

const formatSpread = (value?: number | null): string => {
  if (!isFiniteNumber(value)) return 'N/A';
  // 0.34 -> "0.34%"
  return `${value.toFixed(2)}%`;
};

const spreadBadge = (value?: number | null): string => {
  if (!isFiniteNumber(value)) return '⚪️ <i>N/A</i>';
  if (value <= 0.15) return `🟢 <b>${formatSpread(value)}</b>`;
  if (value <= 0.5) return `🟡 <b>${formatSpread(value)}</b>`;
  return `🔴 <b>${formatSpread(value)}</b>`;
};

const formatTimestamp = (timestamp: number): string =>
  new Date(timestamp).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

/**
 * اگر symbol به شکل BTCUSDT باشد، به BTC/USDT تبدیل می‌کند (برای خوانایی).
 * اگر نتوانست تشخیص بدهد، همان را برمی‌گرداند.
 */
const prettySymbol = (raw: string): string => {
  const s = raw.trim().toUpperCase();
  for (const q of QUOTE_ASSETS) {
    if (s.length > q.length && s.endsWith(q)) {
      const base = s.slice(0, -q.length);
      if (base) return `${base}/${q}`;
    }
  }
  return s;
};

const divider = '────────────';

const parseCsvMap = (raw?: string): Record<string, string> => {
  if (!raw) return {};
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, entry) => {
      const [key, value] = entry.split(':').map((part) => part.trim());
      if (!key || !value) return acc;
      acc[normalizeCanonicalSymbol(key)] = value;
      return acc;
    }, {});
};

const resolveIranSymbolLabels = (): Record<string, string> =>
  parseCsvMap(process.env.FEED_IRAN_SYMBOL_LABELS);
const resolveIranSymbolUnits = (): Record<string, string> =>
  parseCsvMap(process.env.FEED_IRAN_SYMBOL_UNITS);
const resolveIranSymbolExtraUnits = (): Record<string, string> =>
  parseCsvMap(process.env.FEED_IRAN_SYMBOL_EXTRA_UNITS);

const resolveIranValueUnit = (): 'toman' | 'rial' =>
  (process.env.FEED_IRAN_VALUE_UNIT ?? 'toman').toLowerCase() === 'rial' ? 'rial' : 'toman';
const resolveIranShowBoth = (): boolean =>
  (process.env.FEED_IRAN_SHOW_TOMAN_RIAL_BOTH ?? 'true').toLowerCase() !== 'false';

const formatIranNumber = (value: number): string =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value));

const isIranSymbol = (symbol: string): boolean => {
  const normalized = normalizeCanonicalSymbol(symbol);
  if (normalized.endsWith('IRT') || normalized.endsWith('IRR')) {
    return true;
  }
  return ['SEKKEH', 'ABSHODEH', 'GOLD18', '18AYAR'].some((token) => normalized.includes(token));
};

const getIranLabel = (symbol: string): string => {
  const normalized = normalizeCanonicalSymbol(symbol);
  const labels = resolveIranSymbolLabels();
  return labels[normalized] ?? prettySymbol(normalized);
};

const getIranUnit = (symbol: string, fallback: string): string => {
  const normalized = normalizeCanonicalSymbol(symbol);
  const units = resolveIranSymbolUnits();
  return units[normalized] ?? fallback;
};

const getIranExtraUnit = (symbol: string): string | null => {
  const normalized = normalizeCanonicalSymbol(symbol);
  const units = resolveIranSymbolExtraUnits();
  return units[normalized] ?? null;
};

const formatIranPrice = (value: number, symbol: string): { primaryText: string; secondaryText?: string } => {
  if (!Number.isFinite(value)) {
    return { primaryText: 'N/A' };
  }
  const iranValueUnit = resolveIranValueUnit();
  const iranShowBoth = resolveIranShowBoth();
  if (iranValueUnit === 'rial') {
    const primary = formatIranNumber(value);
    const secondary = formatIranNumber(value / 10);
    const primaryUnit = getIranUnit(symbol, 'ریال');
    const secondaryUnit = 'تومان';
    return {
      primaryText: `${primary} ${primaryUnit}`,
      secondaryText: iranShowBoth ? `${secondary} ${secondaryUnit}` : undefined,
    };
  }
  const primary = formatIranNumber(value);
  const secondary = formatIranNumber(value * 10);
  const primaryUnit = getIranUnit(symbol, 'تومان');
  const secondaryUnit = 'ریال';
  return {
    primaryText: `${primary} ${primaryUnit}`,
    secondaryText: iranShowBoth ? `${secondary} ${secondaryUnit}` : undefined,
  };
};

const cleanLines = (lines: string[]) =>
  lines
    .map((x) => x.trimEnd())
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');

export const formatPricesFeedMessage = (params: {
  aggregations: PriceAggregation[];
  format: PricesFeedFormat;
  includeTimestamp: boolean;
  timestamp?: number;
}): string => {
  const { aggregations, format, includeTimestamp, timestamp = Date.now() } = params;

  // NOTE: format فعلاً صرفاً برای سازگاری ورودی نگه داشته شده.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _formatCompat = format;

  const header: string[] = [];
  header.push('🧭 <b>چنده؟</b>  <i>Best Price</i>');
  if (includeTimestamp) header.push(`🕒 <i>${formatTimestamp(timestamp)}</i>`);
  header.push(divider);

  const lines: string[] = [];

  for (const ag of aggregations) {
    const iran = isIranSymbol(ag.symbol);

    const entries = (ag.entries ?? [])
      .filter((e) => isFiniteNumber(e.price))
      .map((e) => ({
        provider: e.provider,
        price: e.price,
        key: normalizeProviderKey(e.provider),
      }))
      .sort((a, b) => a.price - b.price);

    if (entries.length === 0) {
      const name = iran ? escapeHtml(getIranLabel(ag.symbol)) : escapeHtml(prettySymbol(ag.symbol));
      lines.push(`⚠️ ${name} — <b>N/A</b>`);
      continue;
    }

    const best = entries[0];
    const bestP = providerDisplay(best.provider);

    if (iran) {
      const label = escapeHtml(getIranLabel(ag.symbol));
      const extraUnit = getIranExtraUnit(ag.symbol);
      const extraSuffix = extraUnit ? ` <i>(هر ${escapeHtml(extraUnit)})</i>` : '';

      const priceText = formatIranPrice(best.price, ag.symbol);
      const primary = escapeHtml(priceText.primaryText);
      const secondary = priceText.secondaryText ? escapeHtml(priceText.secondaryText) : null;

      lines.push(
        `🇮🇷 ${label} — <b>${primary}</b>${secondary ? `  <i>(${secondary})</i>` : ''}${extraSuffix}`,
      );
      continue;
    }

    const symbol = escapeHtml(prettySymbol(ag.symbol));
    const price = escapeHtml(formatPrice(best.price));

    // NOTE: اگر نمی‌خوای سورس/پرووایدر نمایش داده بشه، این بخش رو کامنت کن:
    const source = ` <i>(${bestP.emoji} ${bestP.text})</i>`;

    lines.push(`🔹 ${symbol} — <b>${price}</b>${source}`);

    // NOTE: جزئیات قبلی مثل Range/Spread/Providers حذف نشدن، فقط دیگه نمایش داده نمی‌شن:
    // const low = entries[0];
    // const high = entries[entries.length - 1];
    // const rangeText = entries.length >= 2 ? ... : ...;
    // const spreadText = ... spreadBadge(ag.spreadPct) ...
    // const providerLines = ...
  }

  return cleanLines([...header, ...lines]);
};
