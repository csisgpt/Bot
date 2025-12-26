import { Strategy } from './types';
interface MacdConfig {
    fastPeriod: number;
    slowPeriod: number;
    signalPeriod: number;
}
export declare const createMacdStrategy: (config: MacdConfig) => Strategy;
export {};
