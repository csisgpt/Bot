import { AssetType, Candle, Signal } from '../types';
export interface StrategyContext {
    candles: Candle[];
    instrument: string;
    interval: string;
    assetType: AssetType;
}
export interface Strategy {
    name: string;
    run(context: StrategyContext): Signal | null;
}
