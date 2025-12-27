export type AssetType = 'GOLD' | 'CRYPTO';

export type SignalKind = 'ENTRY' | 'EXIT' | 'ALERT';

export type SignalSide = 'BUY' | 'SELL' | 'NEUTRAL';

export type SignalSource = 'BINANCE' | 'TRADINGVIEW';

export interface SignalLevels {
  entry?: number;
  sl?: number;
  tp1?: number;
  tp2?: number;
}

export interface Signal {
  id?: string;
  source: SignalSource;
  assetType: AssetType;
  instrument: string;
  interval: string;
  strategy: string;
  kind: SignalKind;
  side: SignalSide;
  price: number | null;
  time: number;
  confidence: number;
  tags: string[];
  reason: string;
  why?: string;
  indicators?: Record<string, number | string | boolean | null>;
  levels?: SignalLevels;
  sl?: number | null;
  tp1?: number | null;
  tp2?: number | null;
  externalId?: string;
  rawPayload?: unknown;
}

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}
