import { escapeHtml } from './formatting.utils';

export interface PriceAggregation {
  symbol: string;
  entries: Array<{ provider: string; price: number }>;
  spreadPct?: number | null;
}

const formatPrice = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);

const formatSpread = (value?: number | null): string => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'N/A';
  }
  return `${value.toFixed(2)}%`;
};

const formatTimestamp = (timestamp: number): string =>
  new Date(timestamp).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

export const formatPricesFeedMessage = (params: {
  aggregations: PriceAggregation[];
  format: 'table' | 'compact';
  includeTimestamp: boolean;
  timestamp?: number;
}): string => {
  const { aggregations, format, includeTimestamp, timestamp = Date.now() } = params;
  const lines: string[] = ['🧭 <b>Market Prices</b>'];

  if (includeTimestamp) {
    lines.push(`<i>${formatTimestamp(timestamp)}</i>`);
  }

  for (const aggregation of aggregations) {
    const symbol = escapeHtml(aggregation.symbol);
    if (format === 'compact') {
      const providerBits = aggregation.entries
        .map((entry) => `${escapeHtml(entry.provider)} ${formatPrice(entry.price)}`)
        .join(' | ');
      lines.push(
        `${symbol} | ${providerBits} | Spread ${formatSpread(aggregation.spreadPct)}`,
      );
      continue;
    }

    lines.push(`<b>${symbol}</b>`);
    for (const entry of aggregation.entries) {
      lines.push(`• ${escapeHtml(entry.provider)}: ${formatPrice(entry.price)}`);
    }
    lines.push(`Spread: ${formatSpread(aggregation.spreadPct)}`);
    lines.push('');
  }

  return lines.filter((line, index, arr) => !(line === '' && arr[index - 1] === '')).join('\n');
};
