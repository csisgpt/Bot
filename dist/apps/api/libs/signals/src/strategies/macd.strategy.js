"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMacdStrategy = void 0;
const indicators_1 = require("../indicators");
const createMacdStrategy = (config) => ({
    name: 'macd',
    run: ({ candles, instrument, interval, assetType }) => {
        if (candles.length < config.slowPeriod + config.signalPeriod) {
            return null;
        }
        const closes = candles.map((candle) => candle.close);
        const { macdLine, signalLine } = (0, indicators_1.macd)(closes, config.fastPeriod, config.slowPeriod, config.signalPeriod);
        const lastIndex = candles.length - 1;
        const prevIndex = candles.length - 2;
        const prevMacd = macdLine[prevIndex];
        const prevSignal = signalLine[prevIndex];
        const currMacd = macdLine[lastIndex];
        const currSignal = signalLine[lastIndex];
        const latest = candles[lastIndex];
        if (prevMacd <= prevSignal && currMacd > currSignal) {
            return {
                source: 'BINANCE',
                assetType,
                instrument,
                interval,
                strategy: 'macd',
                kind: 'ENTRY',
                side: 'BUY',
                price: latest.close,
                time: latest.closeTime,
                confidence: 74,
                tags: ['macd', 'momentum'],
                reason: `MACD crossed above signal (${currMacd.toFixed(4)} > ${currSignal.toFixed(4)}).`,
            };
        }
        if (prevMacd >= prevSignal && currMacd < currSignal) {
            return {
                source: 'BINANCE',
                assetType,
                instrument,
                interval,
                strategy: 'macd',
                kind: 'ENTRY',
                side: 'SELL',
                price: latest.close,
                time: latest.closeTime,
                confidence: 74,
                tags: ['macd', 'momentum'],
                reason: `MACD crossed below signal (${currMacd.toFixed(4)} < ${currSignal.toFixed(4)}).`,
            };
        }
        return null;
    },
});
exports.createMacdStrategy = createMacdStrategy;
//# sourceMappingURL=macd.strategy.js.map