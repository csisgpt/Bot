export interface MarketDataTicker {
  provider: string;
  symbol: string;
  last: number;
  bid?: number;
  ask?: number;
  time?: number;
}

export interface MarketDataCandle {
  provider: string;
  symbol: string;
  interval: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ts: number;
}

export interface MarketDataProviderHealth {
  provider: string;
  lastSuccessAt: number | null;
  lastError: string | null;
  lastLatencyMs: number | null;
}

export interface MarketDataProvider {
  name: string;
  getTickers(params: { symbols: string[] }): Promise<MarketDataTicker[]>;
  getCandles(params: { symbol: string; interval: string; limit?: number }): Promise<MarketDataCandle[]>;
  getSymbols?(): Promise<string[]>;
  getHealth(): MarketDataProviderHealth;
}
