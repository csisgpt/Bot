export type MarketType = 'spot' | 'perp';

export interface Instrument {
  id: string;
  assetType: 'CRYPTO' | 'GOLD' | string;
  base: string;
  quote: string;
  canonicalSymbol: string;
  isActive: boolean;
}

export interface InstrumentMapping {
  provider: string;
  canonicalSymbol: string;
  providerSymbol: string;
  providerInstId: string;
  marketType: MarketType;
  isActive: boolean;
}

export interface Ticker {
  provider: string;
  canonicalSymbol: string;
  ts: number;
  last: number;
  bid: number;
  ask: number;
  volume24h?: number;
}

export interface Candle {
  provider: string;
  canonicalSymbol: string;
  timeframe: string;
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isFinal: boolean;
}

export interface NewsItem {
  provider: string;
  ts: number;
  title: string;
  url: string;
  category: string;
  tags: string[];
  hash: string;
}

export interface ArbOpportunity {
  canonicalSymbol: string;
  ts: number;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  spreadAbs: number;
  spreadPct: number;
  confidence: number;
  reason: string;
  dedupKey: string;
  kind: string;
  netPct?: number;
}

export interface ProviderSnapshot {
  provider: string;
  connected: boolean;
  lastMessageTs: number | null;
  reconnects: number;
  failures: number;
  lastError?: string | null;
}
