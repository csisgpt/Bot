import { Signal } from '@libs/signals';

const formatNumber = (value: number): string => value.toFixed(4);
const formatPrice = (value: number | null | undefined): string =>
  value === null || value === undefined ? 'نامشخص' : formatNumber(value);

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatIndicatorValue = (value: unknown): string => {
  if (value === null || value === undefined) return 'نامشخص';
  if (typeof value === 'number') return formatNumber(value);
  return escapeHtml(String(value));
};

const formatStrategyLabel = (strategy: string): string => {
  const map: Record<string, string> = {
    breakout: 'بریک\u000cاوت',
    ema_rsi: 'EMA + RSI',
    rsi_threshold: 'آستانه RSI',
    macd: 'کراس MACD',
  };
  return map[strategy] ?? strategy;
};

const formatAssetLabel = (asset: string): string => {
  const map: Record<string, string> = {
    GOLD: 'طلا',
    CRYPTO: 'کریپتو',
  };
  return map[asset] ?? asset;
};

const formatSideLabel = (side: Signal['side']): string => {
  if (side === 'BUY') return 'خرید';
  if (side === 'SELL') return 'فروش';
  return 'خنثی';
};

const formatTagLabel = (tag: string): string => {
  const map: Record<string, string> = {
    breakout: 'بریک\u000cاوت',
    momentum: 'مومنتوم',
    ema_cross: 'تقاطع EMA',
    rsi_filter: 'فیلتر RSI',
    trend: 'روند',
    rsi: 'RSI',
    mean_reversion: 'بازگشت به میانگین',
    macd: 'MACD',
  };
  return map[tag] ?? tag;
};

const formatLevels = (levels?: Signal['levels']): string[] => {
  if (!levels) {
    return [];
  }

  const rows: string[] = [];
  if (levels.entry !== undefined) {
    rows.push(`<b>ورود:</b> ${formatNumber(levels.entry)}`);
  }
  if (levels.sl !== undefined) {
    rows.push(`<b>حد ضرر:</b> ${formatNumber(levels.sl)}`);
  }
  if (levels.tp1 !== undefined) {
    rows.push(`<b>هدف ۱:</b> ${formatNumber(levels.tp1)}`);
  }
  if (levels.tp2 !== undefined) {
    rows.push(`<b>هدف ۲:</b> ${formatNumber(levels.tp2)}`);
  }

  return rows;
};

export const formatSignalMessage = (signal: Signal): string => {
  const header =
    signal.side === 'BUY' ? '🟢 خرید' : signal.side === 'SELL' ? '🔴 فروش' : '⚪️ خنثی';
  const tags = signal.tags.map((tag) => formatTagLabel(tag));
  const lines = [
    `<b>${header}</b>`,
    `<b>دارایی:</b> ${escapeHtml(formatAssetLabel(signal.assetType))}`,
    `<b>نماد:</b> ${escapeHtml(signal.instrument)}`,
    `<b>بازه زمانی:</b> ${escapeHtml(signal.interval)}`,
    `<b>استراتژی:</b> ${escapeHtml(formatStrategyLabel(signal.strategy))}`,
    `<b>جهت:</b> ${escapeHtml(formatSideLabel(signal.side))}`,
    `<b>قیمت:</b> ${formatPrice(signal.price)}`,
    `<b>اعتماد:</b> ${signal.confidence}%`,
    `<b>برچسب\u000cها:</b> ${escapeHtml(tags.join('، ') || 'نامشخص')}`,
    `<b>دلیل:</b> ${escapeHtml(signal.reason)}`,
  ];

  const levels = formatLevels(signal.levels);
  if (levels.length > 0) {
    lines.push('<b>سطوح</b>');
    lines.push(...levels);
  }

  lines.push(`<b>زمان:</b> ${new Date(signal.time).toISOString()}`);

  return lines.join('\n');
};

export const formatSignalDetailsMessage = (signal: Signal): string => {
  const lines = [
    '✅ <b>جزئیات سیگنال</b>',
    `<b>نماد:</b> ${escapeHtml(signal.instrument)}`,
    `<b>بازه زمانی:</b> ${escapeHtml(signal.interval)}`,
    `<b>استراتژی:</b> ${escapeHtml(formatStrategyLabel(signal.strategy))}`,
    `<b>اعتماد:</b> ${signal.confidence}%`,
    `<b>زمان:</b> ${new Date(signal.time).toISOString()}`,
  ];

  if (signal.indicators && Object.keys(signal.indicators).length > 0) {
    lines.push('<b>اندیکاتورها</b>');
    for (const [key, value] of Object.entries(signal.indicators)) {
      lines.push(`- ${escapeHtml(key)}: ${formatIndicatorValue(value)}`);
    }
  }

  const levels = formatLevels(signal.levels ?? undefined);
  if (levels.length > 0) {
    lines.push('<b>سطوح</b>');
    lines.push(...levels);
  } else {
    if (signal.sl != null || signal.tp1 != null || signal.tp2 != null) {
      lines.push('<b>سطوح</b>');
      if (signal.sl != null) lines.push(`<b>حد ضرر:</b> ${formatNumber(signal.sl)}`);
      if (signal.tp1 != null) lines.push(`<b>هدف ۱:</b> ${formatNumber(signal.tp1)}`);
      if (signal.tp2 != null) lines.push(`<b>هدف ۲:</b> ${formatNumber(signal.tp2)}`);
    }
  }

  if (signal.why) {
    lines.push(`<b>چرایی:</b> ${escapeHtml(signal.why)}`);
  }

  return lines.join('\n');
};

export interface PriceTickerEntry {
  symbol: string;
  price: number;
}

const formatUtcTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const iso = date.toISOString();
  return `${iso.slice(0, 19).replace('T', ' ')} (UTC)`;
};

export const formatPriceTickerMessage = (
  entries: PriceTickerEntry[],
  timestamp: number = Date.now(),
): string => {
  const lines = ['🟡 تیکر قیمت (بایننس)', formatUtcTimestamp(timestamp)];

  for (const entry of entries) {
    lines.push(`${entry.symbol}: ${formatNumber(entry.price)}`);
  }

  return lines.join('\n');
};
