export type AssetType = 'GOLD' | 'CRYPTO';

export type SignalKind = 'ENTRY' | 'EXIT' | 'ALERT';

export type SignalSide = 'BUY' | 'SELL' | 'NEUTRAL';

export interface SignalLevels {
  entry?: number;
  sl?: number;
  tp1?: number;
  tp2?: number;
}

export interface Signal {
  assetType: AssetType;
  instrument: string;
  interval: string;
  strategy: string;
  kind: SignalKind;
  side: SignalSide;
  price: number;
  time: number;
  confidence: number;
  tags: string[];
  reason: string;
  levels?: SignalLevels;
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
