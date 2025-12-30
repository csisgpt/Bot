import { describe, expect, it } from 'vitest';
import { toInterval } from '@libs/market-data';

describe('interval mapper', () => {
  it('maps to provider-specific intervals', () => {
    expect(toInterval('bybit', '1m')).toBe('1');
    expect(toInterval('okx', '1h')).toBe('1H');
    expect(toInterval('kraken', '1h')).toBe(60);
    expect(toInterval('kucoin', '15m')).toBe('15min');
    expect(toInterval('bitfinex', '1d')).toBe('1D');
  });
});
