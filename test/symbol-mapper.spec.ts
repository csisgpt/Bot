import { describe, expect, it } from 'vitest';
import { okxSymbolFromCanonical } from '@libs/market-data';

describe('okx symbol mapping', () => {
  it('converts canonical symbols to OKX format', () => {
    expect(okxSymbolFromCanonical('BTCUSDT')).toBe('BTC-USDT');
    expect(okxSymbolFromCanonical('ETHUSDC')).toBe('ETH-USDC');
  });

  it('returns null for unknown quotes', () => {
    expect(okxSymbolFromCanonical('FOOBAR')).toBeNull();
  });
});
