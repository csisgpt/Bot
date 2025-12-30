import { describe, expect, it } from 'vitest';
import { formatPriceTickerMessage } from '@libs/telegram';

describe('price ticker formatter', () => {
  it('formats multiple instruments in a single message', () => {
    const timestamp = Date.parse('2025-12-25T18:10:00Z');
    const message = formatPriceTickerMessage(
      [
        { symbol: 'XAUTUSDT', price: 2301.55 },
        { symbol: 'BTCUSDT', price: 98234.12 },
      ],
      timestamp,
    );

    expect(message).toContain('🟡 تیکر قیمت (بایننس)');
    expect(message).toContain('2025-12-25 18:10:00 (UTC)');
    expect(message).toContain('XAUTUSDT: 2301.5500');
    expect(message).toContain('BTCUSDT: 98234.1200');
  });
});
