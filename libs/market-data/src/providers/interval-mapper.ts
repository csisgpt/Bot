export type CanonicalInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

const CANONICAL_INTERVALS = new Set<CanonicalInterval>(['1m', '5m', '15m', '1h', '4h', '1d']);

export const isCanonicalInterval = (v: string): v is CanonicalInterval =>
  CANONICAL_INTERVALS.has(v as CanonicalInterval);

export const normalizeToCanonical = (v: string): CanonicalInterval | null => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (isCanonicalInterval(s)) return s;

  // common numeric-minute encodings
  const map: Record<string, CanonicalInterval> = {
    '1': '1m',
    '5': '5m',
    '15': '15m',
    '60': '1h',
    '240': '4h',
    '1440': '1d',
    'D': '1d',
    '1D': '1d',
    '1H': '1h',
    '4H': '4h',
  };
  return map[s] ?? null;
};

/**
 * canonical -> provider interval
 * Use for: REST params, WS subscribe payloads
 */
export const toProviderInterval = (provider: string, canonical: string): string | number => {
  const c = normalizeToCanonical(canonical);
  if (!c) return canonical;

  switch (provider) {
    case 'bybit':
      return { '1m': '1', '5m': '5', '15m': '15', '1h': '60', '4h': '240', '1d': 'D' }[c];
    case 'okx':
      return { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1H', '4h': '4H', '1d': '1D' }[c];
    case 'coinbase':
      return { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }[c];
    case 'kraken':
      return { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440 }[c];
    case 'kucoin':
      return { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1hour', '4h': '4hour', '1d': '1day' }[c];
    case 'gateio':
      return c;
    case 'bitfinex':
      return c === '1d' ? '1D' : c;
    case 'bitstamp':
      return { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }[c];
    default:
      return c;
  }
};

/**
 * provider interval -> canonical
 * Use for: WS messages (e.g. Bybit sends "1", OKX sends "1H")
 */
export const fromProviderInterval = (provider: string, providerInterval: string): CanonicalInterval | null => {
  const raw = String(providerInterval ?? '').trim();
  if (!raw) return null;

  switch (provider) {
    case 'bybit':
      return ({ '1': '1m', '5': '5m', '15': '15m', '60': '1h', '240': '4h', 'D': '1d' } as Record<string, CanonicalInterval>)[raw] ?? null;
    case 'okx':
      return ({ '1m': '1m', '5m': '5m', '15m': '15m', '1H': '1h', '4H': '4h', '1D': '1d' } as Record<string, CanonicalInterval>)[raw] ?? normalizeToCanonical(raw);
    default:
      return normalizeToCanonical(raw);
  }
};

export const toInterval = (provider: string, interval: string): string | number => {
  // if (!isCanonicalInterval(interval)) {
  //   throw new Error(`Unsupported canonical interval: ${interval}`);
  // }

  if (!isCanonicalInterval(interval)) {
    // allow provider intervals like "1","60" and pass-through
    return interval;
  }
  const i = interval as CanonicalInterval;

  switch (provider) {
    case 'bybit':
      if (i.endsWith('m')) return i.replace('m', '');
      if (i.endsWith('h')) return String(Number(i.replace('h', '')) * 60);
      if (i === '1d') return 'D';
      return i;

    case 'okx':
      if (i.endsWith('m')) return i;
      if (i.endsWith('h')) return i.toUpperCase();
      if (i === '1d') return '1D';
      return i;

    case 'coinbase':
      return {
        '1m': 60,
        '5m': 300,
        '15m': 900,
        '1h': 3600,
        '4h': 14400,
        '1d': 86400,
      }[i];

    case 'kraken':
      return {
        '1m': 1,
        '5m': 5,
        '15m': 15,
        '1h': 60,
        '4h': 240,
        '1d': 1440,
      }[i];

    case 'kucoin':
      return {
        '1m': '1min',
        '5m': '5min',
        '15m': '15min',
        '1h': '1hour',
        '4h': '4hour',
        '1d': '1day',
      }[i];

    case 'gateio':
      return i;

    case 'bitfinex':
      return i === '1d' ? '1D' : i;

    case 'bitstamp':
      return {
        '1m': 60,
        '5m': 300,
        '15m': 900,
        '1h': 3600,
        '4h': 14400,
        '1d': 86400,
      }[i];

    default:
      return i;
  }
};
