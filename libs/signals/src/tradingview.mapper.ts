import { Signal, SignalKind, SignalSide } from './types';

export interface TradingViewDefaults {
  assetType: Signal['assetType'];
  instrument: string;
  interval: string;
  strategy: string;
}

const parseSide = (value: unknown): SignalSide => {
  if (typeof value !== 'string') {
    return 'NEUTRAL';
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === 'BUY' || normalized === 'LONG') {
    return 'BUY';
  }
  if (normalized === 'SELL' || normalized === 'SHORT') {
    return 'SELL';
  }
  return 'NEUTRAL';
};

const parseKind = (value: unknown): SignalKind => {
  if (typeof value !== 'string') {
    return 'ALERT';
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === 'ENTRY' || normalized === 'EXIT' || normalized === 'ALERT') {
    return normalized as SignalKind;
  }
  return 'ALERT';
};

const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const parseTime = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const normalizeTags = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag)).filter((tag) => tag.length > 0);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    return value.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  }
  return [];
};

export const parseTradingViewPayload = (
  payloadRaw: unknown,
): { payload: Record<string, unknown>; rawText?: string; parseError?: string } => {
  if (typeof payloadRaw === 'string') {
    const trimmed = payloadRaw.trim();
    if (trimmed.length === 0) {
      return { payload: {}, rawText: payloadRaw };
    }

    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      return { payload: parsed, rawText: payloadRaw };
    } catch {
      return { payload: { message: trimmed }, rawText: payloadRaw, parseError: 'Invalid JSON' };
    }
  }

  if (payloadRaw && typeof payloadRaw === 'object') {
    return { payload: payloadRaw as Record<string, unknown> };
  }

  return { payload: {} };
};

export const mapTradingViewPayloadToSignal = (
  payloadRaw: unknown,
  defaults: TradingViewDefaults,
  priceFallback?: number,
): Signal => {
  const { payload, rawText } = parseTradingViewPayload(payloadRaw);
  const side = parseSide(payload.signal ?? payload.side ?? payload.direction);
  const kind = parseKind(payload.kind);
  const instrument = (payload.instrument ?? payload.symbol ?? defaults.instrument) as string;
  const interval = (payload.interval ?? payload.timeframe ?? defaults.interval) as string;
  const assetType = (payload.assetType ?? defaults.assetType) as Signal['assetType'];
  const strategy = (payload.strategy ?? defaults.strategy) as string;
  const time = parseTime(payload.time ?? payload.timestamp) ?? Date.now();
  const parsedPrice = parseNumber(payload.price);
  const price = parsedPrice ?? priceFallback ?? null;
  const confidence = parseNumber(payload.confidence) ?? 0;
  const tags = normalizeTags(payload.tags);
  const baseReason = (payload.reason ?? payload.message ?? 'TradingView alert') as string;
  const why = (payload.why ?? payload.explanation) as string | undefined;
  const reason =
    parsedPrice === undefined && priceFallback === undefined
      ? `${baseReason} (price unavailable)`
      : baseReason;
  const externalId = (payload.externalId ?? payload.id) as string | undefined;
  const sl = parseNumber(payload.sl ?? payload.stopLoss);
  const tp1 = parseNumber(payload.tp1 ?? payload.takeProfit1);
  const tp2 = parseNumber(payload.tp2 ?? payload.takeProfit2);
  const indicators =
    payload.indicators
      ? Object.fromEntries(
        Object.entries(payload.indicators).map(([k, v]) => {
          if (v === null || v === undefined) return [k, null];
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return [k, v];
          return [k, String(v)]; // هر چیز دیگری → string
        }),
      )
      : undefined;
  return {
    source: 'TRADINGVIEW',
    assetType,
    instrument,
    interval,
    strategy,
    kind,
    side,
    price,
    time,
    confidence,
    tags: tags.length > 0 ? tags : ['tradingview'],
    reason,
    why,
    indicators,
    externalId,
    sl: sl ?? null,
    tp1: tp1 ?? null,
    tp2: tp2 ?? null,
    rawPayload: rawText ?? payload,
  };
};
