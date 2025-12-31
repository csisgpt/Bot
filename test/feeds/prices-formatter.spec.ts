import { describe, expect, it } from 'vitest';
import { formatPricesFeedMessage } from '../../apps/worker/src/feeds/formatters/prices.formatter';
import { chunkMessage } from '../../apps/worker/src/feeds/formatters/formatting.utils';

describe('prices formatter', () => {
  it('escapes html in symbols and provider names', () => {
    const message = formatPricesFeedMessage({
      aggregations: [
        {
          symbol: 'BTC<USDT',
          entries: [{ provider: 'Binance & Co', price: 12345.67 }],
          spreadPct: 0.1,
        },
      ],
      format: 'table',
      includeTimestamp: false,
    });

    expect(message).toContain('BTC&lt;/USDT');
    expect(message).toContain('Binance &amp; Co');
  });

  it('chunks long messages', () => {
    const message = formatPricesFeedMessage({
      aggregations: Array.from({ length: 10 }, (_, index) => ({
        symbol: `SYM${index}`,
        entries: [{ provider: 'Binance', price: 100 + index }],
        spreadPct: null,
      })),
      format: 'table',
      includeTimestamp: true,
    });

    const chunks = chunkMessage(message, 120);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('\n')).toContain('Price Snapshot');
  });

  it('formats Iran prices with toman and rial', () => {
    const prevUnit = process.env.FEED_IRAN_VALUE_UNIT;
    const prevBoth = process.env.FEED_IRAN_SHOW_TOMAN_RIAL_BOTH;
    process.env.FEED_IRAN_VALUE_UNIT = 'toman';
    process.env.FEED_IRAN_SHOW_TOMAN_RIAL_BOTH = 'true';

    const message = formatPricesFeedMessage({
      aggregations: [
        {
          symbol: 'USDIRT',
          entries: [{ provider: 'navasan', price: 59200 }],
          spreadPct: null,
        },
      ],
      format: 'table',
      includeTimestamp: false,
    });

    expect(message).toContain('تومان');
    expect(message).toContain('ریال');
    expect(message).toContain('59,200');
    expect(message).not.toMatch(/\d+\.\d+/);

    if (prevUnit === undefined) {
      delete process.env.FEED_IRAN_VALUE_UNIT;
    } else {
      process.env.FEED_IRAN_VALUE_UNIT = prevUnit;
    }
    if (prevBoth === undefined) {
      delete process.env.FEED_IRAN_SHOW_TOMAN_RIAL_BOTH;
    } else {
      process.env.FEED_IRAN_SHOW_TOMAN_RIAL_BOTH = prevBoth;
    }
  });
});
