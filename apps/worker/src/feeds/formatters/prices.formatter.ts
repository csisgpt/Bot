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

  const header: string[] = [];
  header.push('🧭 <b>چنده؟</b>  <i>Price Snapshot</i>');
  if (includeTimestamp) header.push(`🕒 <i>${formatTimestamp(timestamp)}</i>`);
  header.push(divider);

  const blocks: string[] = [];

  for (const ag of aggregations) {
    const symbol = escapeHtml(prettySymbol(ag.symbol));
    const iranSymbol = isIranSymbol(ag.symbol);

    const entries = (ag.entries ?? [])
      .filter((e) => isFiniteNumber(e.price))
      .map((e) => ({
        provider: e.provider,
        price: e.price,
        key: normalizeProviderKey(e.provider),
      }))
      .sort((a, b) => a.price - b.price);

    if (entries.length === 0) {
      blocks.push(
        [
          `🔹 <b>${symbol}</b>`,
          `⚠️ <i>هیچ قیمتی از پرووایدرها نرسید</i>`,
        ].join('\n'),
      );
      blocks.push(divider);
      continue;
    }

    const low = entries[0];
    const high = entries[entries.length - 1];
    const best = low; // پایین‌ترین قیمت به‌عنوان Best (می‌تونی اگر خواستی “میانه/میانگین” بذاری)

    const bestP = providerDisplay(best.provider);
    const rangeText =
      entries.length >= 2
        ? `↕️ <i>Range</i>: <code>${formatPrice(low.price)}</code> تا <code>${formatPrice(
            high.price,
          )}</code>`
        : `↕️ <i>Range</i>: <code>${formatPrice(best.price)}</code>`;

    const spreadText = `📊 <i>Spread</i>: ${spreadBadge(ag.spreadPct)}  <i>(${formatSpread(
      ag.spreadPct,
    )})</i>`;

    // فهرست پرووایدرها (بدون حس جدول)
    const formatEntryPrice = iranSymbol ? (value: number) => formatIranNumber(value) : formatPrice;
    const providerLines =
      format === 'compact'
        ? // compact: حداکثر 3 مورد (بهترین + چندتا از بقیه)
          entries
            .slice(0, Math.min(3, entries.length))
            .map((e, idx) => {
              const p = providerDisplay(e.provider);
              const tag = idx === 0 ? '🏷️ <i>Best</i>' : '•';
              return `${tag} ${p.emoji} <b>${p.text}</b> — <code>${formatEntryPrice(e.price)}</code>`;
            })
        : // "table" => detailed ولی غیرجدولی
          entries.map((e, idx) => {
            const p = providerDisplay(e.provider);
            const isBest = idx === 0;
            const bullet = isBest ? '🏷️ <i>Best</i>' : '•';
            return `${bullet} ${p.emoji} <b>${p.text}</b> — <code>${formatEntryPrice(e.price)}</code>`;
          });

    const block: string[] = [];
    block.push(`🔹 <b>${symbol}</b>`);
    if (iranSymbol) {
      const label = escapeHtml(getIranLabel(ag.symbol));
      const extraUnit = getIranExtraUnit(ag.symbol);
      const extraSuffix = extraUnit ? ` — <i>هر</i> ${escapeHtml(extraUnit)}` : '';
      const priceText = formatIranPrice(best.price, ag.symbol);
      block.push(`🇮🇷 <b>${label}</b>`);
      block.push(
        `💵 <i>Price</i>: <code>${priceText.primaryText}</code>${priceText.secondaryText ? `  <i>(${priceText.secondaryText})</i>` : ''}${extraSuffix}`,
      );
    } else {
      block.push(
        `💰 <i>Best</i>: <code>${formatPrice(best.price)}</code>  <i>via</i> ${bestP.emoji} <b>${bestP.text}</b>`,
      );
      block.push(rangeText);
      block.push(spreadText);
    }
    block.push(''); // فاصله نرم
    block.push('🧩 <i>Providers</i>');
    block.push(...providerLines);

    blocks.push(block.join('\n'));
    blocks.push(divider);
  }

  // حذف divider اضافه‌ی آخر
  if (blocks.length && blocks[blocks.length - 1] === divider) blocks.pop();

  return cleanLines([...header, ...blocks]);
};
