import { AssetType, Candle, Signal } from '../types';

export interface StrategyContext {
  candles: Candle[];
  instrument: string;
  interval: string;
  assetType: AssetType;
}

export type SignalCandidate = Omit<Signal, 'id'>;

export interface Strategy {
  id: string;
  displayName: string;
  requiredIndicators?: string[];
  evaluate(context: StrategyContext): SignalCandidate | null;
}
