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

    expect(message).toContain('BTC&lt;USDT');
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
    expect(chunks.join('\n')).toContain('Market Prices');
  });
});
