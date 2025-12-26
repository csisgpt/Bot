import { Strategy } from './types';
interface BreakoutConfig {
    lookback: number;
}
export declare const createBreakoutStrategy: (config: BreakoutConfig) => Strategy;
export {};
