import { Strategy } from './types';
interface RsiThresholdConfig {
    rsiPeriod: number;
    rsiBuyThreshold: number;
    rsiSellThreshold: number;
}
export declare const createRsiThresholdStrategy: (config: RsiThresholdConfig) => Strategy;
export {};
