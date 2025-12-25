import { Signal } from './types';

const DEFAULT_BUCKET_MS = 60_000;

const intervalToMs = (interval: string | undefined): number | null => {
  if (!interval) {
    return null;
  }

  const normalized = interval.trim().toLowerCase();
  const match = normalized.match(/^(\d+)([smhdw])$/);
  if (!match) {
    return null;
  }

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const unit = match[2];
  switch (unit) {
    case 's':
      return value * 1000;
    case 'm':
      return value * 60_000;
    case 'h':
      return value * 3_600_000;
    case 'd':
      return value * 86_400_000;
    case 'w':
      return value * 604_800_000;
    default:
      return null;
  }
};

export const floorSignalTimeToBucket = (timeMs: number, interval?: string): number => {
  const bucketMs = intervalToMs(interval) ?? DEFAULT_BUCKET_MS;
  return Math.floor(timeMs / bucketMs) * bucketMs;
};

export const buildSignalDedupeKey = (signal: Signal): string => {
  const source = signal.source ?? 'BINANCE';
  const bucketTime = new Date(floorSignalTimeToBucket(signal.time, signal.interval)).toISOString();
  return [
    source,
    signal.assetType,
    signal.instrument,
    signal.interval,
    signal.strategy,
    signal.kind,
    signal.side,
    bucketTime,
  ].join(':');
};
