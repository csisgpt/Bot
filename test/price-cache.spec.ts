import { describe, expect, it } from 'vitest';
import { getPriceCacheKey } from '@libs/binance';

describe('price cache keys', () => {
  it('normalizes symbols for cache keys', () => {
    expect(getPriceCacheKey(' xautusdt ')).toBe('price:last:XAUTUSDT');
  });
});
