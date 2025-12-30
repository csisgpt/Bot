export type CanonicalInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export const toInterval = (provider: string, interval: CanonicalInterval): string | number => {
  switch (provider) {
    case 'bybit':
      if (interval.endsWith('m')) return interval.replace('m', '');
      if (interval.endsWith('h')) return String(Number(interval.replace('h', '')) * 60);
      if (interval === '1d') return 'D';
      return interval;
    case 'okx':
      if (interval.endsWith('m')) return interval;
      if (interval.endsWith('h')) return interval.toUpperCase();
      if (interval === '1d') return '1D';
      return interval;
    case 'coinbase':
      return {
        '1m': 60,
        '5m': 300,
        '15m': 900,
        '1h': 3600,
        '4h': 14400,
        '1d': 86400,
      }[interval];
    case 'kraken':
      return {
        '1m': 1,
        '5m': 5,
        '15m': 15,
        '1h': 60,
        '4h': 240,
        '1d': 1440,
      }[interval];
    case 'kucoin':
      return {
        '1m': '1min',
        '5m': '5min',
        '15m': '15min',
        '1h': '1hour',
        '4h': '4hour',
        '1d': '1day',
      }[interval];
    case 'gateio':
      return interval;
    case 'bitfinex':
      return interval === '1d' ? '1D' : interval;
    case 'bitstamp':
      return {
        '1m': 60,
        '5m': 300,
        '15m': 900,
        '1h': 3600,
        '4h': 14400,
        '1d': 86400,
      }[interval];
    default:
      return interval;
  }
};
