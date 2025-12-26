export declare function ema(values: number[], period: number): number[];
export declare function rsi(values: number[], period?: number): number[];
export declare function atr(highs: number[], lows: number[], closes: number[], period?: number): number[];
export declare function macd(values: number[], fastPeriod?: number, slowPeriod?: number, signalPeriod?: number): {
    macdLine: number[];
    signalLine: number[];
    histogram: number[];
};
