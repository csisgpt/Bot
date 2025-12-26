import { Strategy } from './types';
interface EmaRsiConfig {
    emaFastPeriod: number;
    emaSlowPeriod: number;
    rsiPeriod: number;
    rsiBuyThreshold: number;
    rsiSellThreshold: number;
}
export declare const createEmaRsiStrategy: (config: EmaRsiConfig) => Strategy;
export {};
