export interface MarketDataKline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  closeTime: number;
}

export interface MarketDataProvider {
  source: string;
  getLastPrice(
    symbol: string,
  ): Promise<{ instrument: string; price: number; ts: number } | null>;
  getKlines(
    symbol: string,
    timeframe: string,
    limit: number,
    endTime?: number,
  ): Promise<MarketDataKline[]>;
}
