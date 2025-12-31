import { escapeHtml } from './formatting.utils';
import { normalizeCanonicalSymbol } from '@libs/market-data';

export interface PriceAggregation {
  symbol: string;
  entries: Array<{ provider: string; price: number }>;
  spreadPct?: number | null;
}

type PricesFeedFormat = 'table' | 'compact'; // برای سازگاری؛ خروجی جدید، "card/section" است.

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

const PROVIDER_SHORT: Record<string, string> = {
  binance: 'BN',
  bybit: 'BY',
  okx: 'OKX',
  kucoin: 'KC',
  kraken: 'KR',
  coinbase: 'CB',
  mexc: 'MX',
  gate: 'GT',
  twelvedata: 'TD',
  navasan: 'NV',
  brsapi_market: 'BRS',
  bonbast: 'BB',
};

const normalizeProviderKey = (p: string) => p.trim().toLowerCase();

const providerDisplay = (provider: string): { text: string; emoji: string; short: string } => {
  const key = normalizeProviderKey(provider);
  const meta = PROVIDER_META[key];
  const safeLabel = escapeHtml(meta?.label ?? provider.trim());
  const short = escapeHtml(PROVIDER_SHORT[key] ?? (meta?.label ?? provider.trim()).slice(0, 6).toUpperCase());
  return { text: safeLabel, emoji: meta?.emoji ?? '🏦', short };
};

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const formatPrice = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);

// NOTE: قبلی را نگه می‌داریم (fallback)
const formatTimestamp = (timestamp: number): string =>
  new Date(timestamp).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

/**
 * تایم‌استمپ فارسی (ترجیحاً شمسی/جلالی) با کنترل کامل روی خروجی.
 * - TimeZone: FEED_TIMESTAMP_TZ || APP_TIMEZONE || 'UTC'
 * - Numerals: پیش‌فرض اعداد فارسی؛ اگر خواستی لاتین: FEED_TIMESTAMP_NUMERALS=latn
 * - Fallback: اگر Intl/ICU یا timezone مشکل داشت، می‌افتد به formatTimestamp قبلی
 */
const resolveTimestampTimeZone = (): string =>
  (process.env.FEED_TIMESTAMP_TZ ?? process.env.APP_TIMEZONE ?? 'UTC').trim() || 'UTC';

const resolveTimestampNumerals = (): 'native' | 'latn' =>
  (process.env.FEED_TIMESTAMP_NUMERALS ?? 'native').toLowerCase() === 'latn' ? 'latn' : 'native';

const buildFaLocale = (): string => {
  // fa-IR with Persian calendar; numerals configurable
  const numerals = resolveTimestampNumerals();
  const base = 'fa-IR-u-ca-persian';
  return numerals === 'latn' ? `${base}-nu-latn` : base;
};

const formatTimestampFa = (timestamp: number): string => {
  const timeZone = resolveTimestampTimeZone();
  const locale = buildFaLocale();

  try {
    const dtf = new Intl.DateTimeFormat(locale, {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });

    const parts = dtf.formatToParts(new Date(timestamp));
    const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';

    const y = pick('year');
    const m = pick('month');
    const d = pick('day');
    const hh = pick('hour');
    const mm = pick('minute');
    const ss = pick('second');

    const date = [y, m, d].filter(Boolean).join('/');
    const time = [hh, mm, ss].filter(Boolean).join(':');

    // خروجی کوتاه و تمیز برای هدر
    return `${date} ${time}`;
  } catch {
    return formatTimestamp(timestamp);
  }
};

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

// Dividerهای جدید (حس “کارت/بخش”)
const divider = '━━━━━━━━━━━━━━━━━━━━';
const softDivider = '────────────';

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

// NOTE: نسخه‌ی قبلی formatIranPrice نگه داشته شد (حذف نکردم).
// const formatIranPrice = (...) => ...

const cleanLines = (lines: string[]) =>
  lines
    .map((x) => x.trimEnd())
    .filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
    .join('\n');

type SectionKey = 'crypto' | 'fx' | 'metals' | 'iran' | 'other';

const classify = (rawSymbol: string): SectionKey => {
  if (isIranSymbol(rawSymbol)) return 'iran';

  const s = prettySymbol(rawSymbol).toUpperCase();
  // Metals / commodities
  if (s.includes('XAU') || s.includes('XAG') || s.includes('XAUT')) return 'metals';

  // FX (fiat crosses)
  const fiat = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'CHF', 'AUD', 'NZD'] as const;
  const parts = s.split('/');
  if (parts.length === 2 && fiat.includes(parts[0] as any) && fiat.includes(parts[1] as any)) return 'fx';

  // Crypto (USDT/USDC mostly)
  if (s.endsWith('/USDT') || s.endsWith('/USDC') || s.endsWith('/BTC') || s.endsWith('/ETH')) return 'crypto';

  return 'other';
};

export const formatPricesFeedMessage = (params: {
  aggregations: PriceAggregation[];
  format: PricesFeedFormat;
  includeTimestamp: boolean;
  timestamp?: number;
}): string => {
  const { aggregations, format, includeTimestamp, timestamp = Date.now() } = params;

  // NOTE: format فعلاً برای سازگاری نگه داشته شده.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _formatCompat = format;

  const header: string[] = [];
  header.push(`🧭 <b>Best Prices</b>  <i>Snapshot</i>`);
  if (includeTimestamp) header.push(`🕒 <code>${escapeHtml(formatTimestampFa(timestamp))}</code>`);
  header.push(divider);

  const groups: Record<SectionKey, string[]> = {
    crypto: [],
    fx: [],
    metals: [],
    iran: [],
    other: [],
  };

  const usedProviders = new Map<string, { emoji: string; label: string; short: string }>();

  for (const ag of aggregations) {
    const entries = (ag.entries ?? [])
      .filter((e) => isFiniteNumber(e.price))
      .map((e) => ({
        provider: e.provider,
        price: e.price,
        key: normalizeProviderKey(e.provider),
      }))
      .sort((a, b) => a.price - b.price);

    const section = classify(ag.symbol);

    if (entries.length === 0) {
      const title =
        section === 'iran'
          ? escapeHtml(getIranLabel(ag.symbol))
          : escapeHtml(prettySymbol(ag.symbol));
      groups[section].push(`• <b>${title}</b>  —  <b>N/A</b>  <i>no data</i>`);
      continue;
    }

    const best = entries[0];
    const p = providerDisplay(best.provider);
    usedProviders.set(normalizeProviderKey(best.provider), { emoji: p.emoji, label: p.text, short: p.short });

    if (section === 'iran') {
      // عددها داخل <code> برای کنترل بهتر RTL/LTR
      const label = escapeHtml(getIranLabel(ag.symbol));
      const extraUnit = getIranExtraUnit(ag.symbol);
      const extraSuffix = extraUnit ? `  <i>· هر ${escapeHtml(extraUnit)}</i>` : '';

      const iranValueUnit = resolveIranValueUnit();
      const iranShowBoth = resolveIranShowBoth();

      if (iranValueUnit === 'rial') {
        const primaryNum = escapeHtml(formatIranNumber(best.price));
        const secondaryNum = escapeHtml(formatIranNumber(best.price / 10));
        const primaryUnit = escapeHtml(getIranUnit(ag.symbol, 'ریال'));
        const secondaryUnit = 'تومان';

        groups.iran.push(
          `• 🇮🇷 <b>${label}</b>  —  <b><code>${primaryNum}</code></b> ${primaryUnit}${
            iranShowBoth ? `  <i>(<code>${secondaryNum}</code> ${secondaryUnit})</i>` : ''
          }${extraSuffix}  <i>· ${p.emoji} ${p.text}</i>`,
        );
      } else {
        const primaryNum = escapeHtml(formatIranNumber(best.price));
        const secondaryNum = escapeHtml(formatIranNumber(best.price * 10));
        const primaryUnit = escapeHtml(getIranUnit(ag.symbol, 'تومان'));
        const secondaryUnit = 'ریال';

        groups.iran.push(
          `• 🇮🇷 <b>${label}</b>  —  <b><code>${primaryNum}</code></b> ${primaryUnit}${
            iranShowBoth ? `  <i>(<code>${secondaryNum}</code> ${secondaryUnit})</i>` : ''
          }${extraSuffix}  <i>· ${p.emoji} ${p.text}</i>`,
        );
      }

      continue;
    }

    // غیر ایران: یک خط تمیز و قابل اسکن
    const symbol = escapeHtml(prettySymbol(ag.symbol));
    const price = escapeHtml(formatPrice(best.price));

    groups[section].push(`• <b>${symbol}</b>  —  <b><code>${price}</code></b>  <i>· ${p.emoji} ${p.text}</i>`);

    // NOTE: جزئیات قبلی (Range/Spread/Providers list) حذف نشد؛ فقط دیگه نمایش داده نمی‌شه.
    // const low = entries[0];
    // const high = entries[entries.length - 1];
    // const rangeText = ...
    // const spreadText = ...
    // const providerLines = ...
  }

  const body: string[] = [];

  const pushSection = (title: string, key: SectionKey) => {
    if (!groups[key].length) return;
    body.push(`🔸 <b>${title}</b>`);
    body.push(...groups[key]);
    body.push(''); // فاصله نرم بین بخش‌ها
  };

  pushSection('Crypto', 'crypto');
  pushSection('FX', 'fx');
  pushSection('Metals', 'metals');
  pushSection('Other', 'other');
  pushSection('Iran', 'iran');

  // Footer: legend کوتاه و اعتمادساز
  const used = Array.from(usedProviders.values());
  if (used.length) {
    body.push(softDivider);
    const legend = used
      .slice(0, 8) // طول پیام رو کنترل می‌کنیم
      .map((x) => `${x.emoji} <b>${x.short}</b>=${x.label}`)
      .join('  •  ');
    body.push(`ⓘ <i>Sources</i>: ${legend}`);
  }

  // حذف فاصله‌ی اضافه‌ی آخر
  while (body.length && body[body.length - 1] === '') body.pop();

  return cleanLines([...header, ...body]);
};