import { ArbitrageStrategy, ArbitrageSnapshot } from '../../interfaces';
import { ArbOpportunity, Ticker } from '../../models';

interface CrossExchangeOptions {
  minSpreadPct: number;
  minNetPct: number;
  feeBps: Record<string, number>;
}

export class CrossExchangeSpreadStrategy implements ArbitrageStrategy {
  readonly kind = 'CROSS';
  readonly requiredCapabilities = ['best_bid_ask'];

  constructor(private readonly options: CrossExchangeOptions) {}

  scan(snapshot: ArbitrageSnapshot): ArbOpportunity[] {
    const opportunities: ArbOpportunity[] = [];
    const { tickers, ts } = snapshot;

    for (const [symbol, providers] of Object.entries(tickers)) {
      const entries = Object.entries(providers).filter(([, ticker]) => this.isValid(ticker));
      if (entries.length < 2) {
        continue;
      }

      const sortedByAsk = [...entries].sort((a, b) => a[1].ask - b[1].ask);
      const sortedByBid = [...entries].sort((a, b) => b[1].bid - a[1].bid);

      const [buyProvider, buyTicker] = sortedByAsk[0];
      const [sellProvider, sellTicker] = sortedByBid[0];

      if (buyProvider === sellProvider) {
        continue;
      }

      const spreadAbs = sellTicker.bid - buyTicker.ask;
      const spreadPct = (spreadAbs / buyTicker.ask) * 100;
      const feeBuy = (this.options.feeBps[buyProvider] ?? 0) / 100;
      const feeSell = (this.options.feeBps[sellProvider] ?? 0) / 100;
      const netPct = spreadPct - (feeBuy + feeSell);

      if (spreadPct < this.options.minSpreadPct || netPct < this.options.minNetPct) {
        continue;
      }

      opportunities.push({
        canonicalSymbol: symbol,
        ts,
        buyExchange: buyProvider,
        sellExchange: sellProvider,
        buyPrice: buyTicker.ask,
        sellPrice: sellTicker.bid,
        spreadAbs,
        spreadPct,
        netPct,
        confidence: 70,
        reason: 'اختلاف قیمت بین صرافی‌ها',
        dedupKey: '',
        kind: this.kind,
      });
    }

    return opportunities;
  }

  private isValid(ticker: Ticker): boolean {
    return [ticker.bid, ticker.ask].every(Number.isFinite);
  }
}
