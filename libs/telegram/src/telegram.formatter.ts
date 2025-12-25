import { Prisma, Signal as PrismaSignal } from '@prisma/client';
import { Signal } from '@libs/signals';

const formatNumber = (value: number): string => value.toFixed(4);

const toNumber = (value: number | Prisma.Decimal): number =>
  value instanceof Prisma.Decimal ? value.toNumber() : value;

const formatPrice = (value: number | Prisma.Decimal | null | undefined): string =>
  value === null || value === undefined ? 'N/A' : formatNumber(toNumber(value));

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

type SignalLike = Signal | PrismaSignal;

const toDate = (value: number | Date): Date => (value instanceof Date ? value : new Date(value));

export const formatSignalMessage = (signal: SignalLike): string => {
  const header = signal.side === 'BUY' ? '🟢 BUY' : signal.side === 'SELL' ? '🔴 SELL' : '⚪️ NEUTRAL';
  const lines = [
    `<b>${header}</b>`,
    `<b>Asset:</b> ${signal.assetType}`,
    `<b>Instrument:</b> ${signal.instrument}`,
    `<b>Interval:</b> ${signal.interval}`,
    `<b>Strategy:</b> ${signal.strategy}`,
    `<b>Price:</b> ${formatPrice(signal.price as number | Prisma.Decimal | null | undefined)}`,
    `<b>Confidence:</b> ${signal.confidence}%`,
    `<b>Tags:</b> ${signal.tags.join(', ') || 'n/a'}`,
    `<b>Reason:</b> ${signal.reason}`,
  ];

  const levels = formatLevels(signal.levels as Signal['levels']);
  if (levels.length > 0) {
    lines.push('<b>Levels</b>');
    lines.push(...levels);
  }

  lines.push(`<b>Time:</b> ${toDate(signal.time as number | Date).toISOString()}`);

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
