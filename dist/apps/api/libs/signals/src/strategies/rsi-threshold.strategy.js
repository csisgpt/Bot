"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRsiThresholdStrategy = void 0;
const indicators_1 = require("../indicators");
const createRsiThresholdStrategy = (config) => ({
    name: 'rsi_threshold',
    run: ({ candles, instrument, interval, assetType }) => {
        if (candles.length < config.rsiPeriod + 1) {
            return null;
        }
        const closes = candles.map((candle) => candle.close);
        const rsiValues = (0, indicators_1.rsi)(closes, config.rsiPeriod);
        const lastIndex = candles.length - 1;
        const currRsi = rsiValues[lastIndex];
        const latest = candles[lastIndex];
        if (currRsi <= config.rsiBuyThreshold) {
            return {
                source: 'BINANCE',
                assetType,
                instrument,
                interval,
                strategy: 'rsi_threshold',
                kind: 'ENTRY',
                side: 'BUY',
                price: latest.close,
                time: latest.closeTime,
                confidence: 66,
                tags: ['rsi', 'mean_reversion'],
                reason: `RSI ${currRsi.toFixed(2)} below buy threshold ${config.rsiBuyThreshold}.`,
            };
        }
        if (currRsi >= config.rsiSellThreshold) {
            return {
                source: 'BINANCE',
                assetType,
                instrument,
                interval,
                strategy: 'rsi_threshold',
                kind: 'ENTRY',
                side: 'SELL',
                price: latest.close,
                time: latest.closeTime,
                confidence: 66,
                tags: ['rsi', 'mean_reversion'],
                reason: `RSI ${currRsi.toFixed(2)} above sell threshold ${config.rsiSellThreshold}.`,
            };
        }
        return null;
    },
});
exports.createRsiThresholdStrategy = createRsiThresholdStrategy;
//# sourceMappingURL=rsi-threshold.strategy.js.map