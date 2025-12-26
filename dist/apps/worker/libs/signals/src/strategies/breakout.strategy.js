"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBreakoutStrategy = void 0;
const createBreakoutStrategy = (config) => ({
    name: 'breakout',
    run: ({ candles, instrument, interval, assetType }) => {
        if (candles.length < config.lookback + 1) {
            return null;
        }
        const lastIndex = candles.length - 1;
        const lookbackCandles = candles.slice(lastIndex - config.lookback, lastIndex);
        const high = Math.max(...lookbackCandles.map((candle) => candle.high));
        const low = Math.min(...lookbackCandles.map((candle) => candle.low));
        const latest = candles[lastIndex];
        if (latest.close > high) {
            return {
                source: 'BINANCE',
                assetType,
                instrument,
                interval,
                strategy: 'breakout',
                kind: 'ENTRY',
                side: 'BUY',
                price: latest.close,
                time: latest.closeTime,
                confidence: 72,
                tags: ['breakout', 'momentum'],
                reason: `Close ${latest.close.toFixed(4)} broke above ${config.lookback}-period high ${high.toFixed(4)}.`,
            };
        }
        if (latest.close < low) {
            return {
                source: 'BINANCE',
                assetType,
                instrument,
                interval,
                strategy: 'breakout',
                kind: 'ENTRY',
                side: 'SELL',
                price: latest.close,
                time: latest.closeTime,
                confidence: 72,
                tags: ['breakout', 'momentum'],
                reason: `Close ${latest.close.toFixed(4)} broke below ${config.lookback}-period low ${low.toFixed(4)}.`,
            };
        }
        return null;
    },
});
exports.createBreakoutStrategy = createBreakoutStrategy;
//# sourceMappingURL=breakout.strategy.js.map