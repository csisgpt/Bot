import { Signal } from '@libs/signals';

const formatNumber = (value: number): string => value.toFixed(4);
const formatPrice = (value: number | null | undefined): string =>
  value === null || value === undefined ? 'N/A' : formatNumber(value);

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatIndicatorValue = (value: unknown): string => {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'number') return formatNumber(value);
  return escapeHtml(String(value));
};

const formatLevels = (levels?: Signal['levels']): string[] => {
  if (!levels) {
    return [];
  }

  const rows: string[] = [];
  if (levels.entry !== undefined) {
    rows.push(`<b>Entry:</b> ${formatNumber(levels.entry)}`);
  }
  if (levels.sl !== undefined) {
    rows.push(`<b>SL:</b> ${formatNumber(levels.sl)}`);
  }
  if (levels.tp1 !== undefined) {
    rows.push(`<b>TP1:</b> ${formatNumber(levels.tp1)}`);
  }
  if (levels.tp2 !== undefined) {
    rows.push(`<b>TP2:</b> ${formatNumber(levels.tp2)}`);
  }

  return rows;
};

export const formatSignalMessage = (signal: Signal): string => {
  const header = signal.side === 'BUY' ? '🟢 1خ' : signal.side === 'SELL' ? '🔴 1ف' : '⚪️ NEUTRAL';
  const lines = [
    `<b>${header}</b>`,
    `<b>Asset:</b> ${escapeHtml(signal.assetType)}`,
    `<b>Instrument:</b> ${escapeHtml(signal.instrument)}`,
    `<b>Interval:</b> ${escapeHtml(signal.interval)}`,
    `<b>Strategy:</b> ${escapeHtml(signal.strategy)}`,
    `<b>Price:</b> ${formatPrice(signal.price)}`,
    `<b>Confidence:</b> ${signal.confidence}%`,
    `<b>Tags:</b> ${escapeHtml(signal.tags.join(', ') || 'n/a')}`,
    `<b>Reason:</b> ${escapeHtml(signal.reason)}`,
  ];

  const levels = formatLevels(signal.levels);
  if (levels.length > 0) {
    lines.push('<b>Levels</b>');
    lines.push(...levels);
  }

  lines.push(`<b>Time:</b> ${new Date(signal.time).toISOString()}`);

  return lines.join('\n');
};

export const formatSignalDetailsMessage = (signal: Signal): string => {
  const lines = [
    '✅ <b>Signal details</b>',
    `<b>Instrument:</b> ${escapeHtml(signal.instrument)}`,
    `<b>Timeframe:</b> ${escapeHtml(signal.interval)}`,
    `<b>Strategy:</b> ${escapeHtml(signal.strategy)}`,
    `<b>Confidence:</b> ${signal.confidence}%`,
    `<b>Time:</b> ${new Date(signal.time).toISOString()}`,
  ];

  if (signal.indicators && Object.keys(signal.indicators).length > 0) {
    lines.push('<b>Indicators</b>');
    for (const [key, value] of Object.entries(signal.indicators)) {
      lines.push(`- ${escapeHtml(key)}: ${formatIndicatorValue(value)}`);
    }
  }

  const levels = formatLevels(signal.levels ?? undefined);
  if (levels.length > 0) {
    lines.push('<b>Levels</b>');
    lines.push(...levels);
  } else {
    if (signal.sl != null || signal.tp1 != null || signal.tp2 != null) {
      lines.push('<b>Levels</b>');
      if (signal.sl != null) lines.push(`<b>SL:</b> ${formatNumber(signal.sl)}`);
      if (signal.tp1 != null) lines.push(`<b>TP1:</b> ${formatNumber(signal.tp1)}`);
      if (signal.tp2 != null) lines.push(`<b>TP2:</b> ${formatNumber(signal.tp2)}`);
    }
  }

  if (signal.why) {
    lines.push(`<b>Why:</b> ${escapeHtml(signal.why)}`);
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
  return `${iso.slice(0, 19).replace('T', ' ')} UTC`;
};

export const formatPriceTickerMessage = (
  entries: PriceTickerEntry[],
  timestamp: number = Date.now(),
): string => {
  const lines = ['🟡 Price Ticker (Binance)', formatUtcTimestamp(timestamp)];

  for (const entry of entries) {
    lines.push(`${entry.symbol}: ${formatNumber(entry.price)}`);
  }

  return lines.join('\n');
};
