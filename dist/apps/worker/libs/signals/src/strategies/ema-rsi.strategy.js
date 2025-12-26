"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmaRsiStrategy = void 0;
const indicators_1 = require("../indicators");
const createEmaRsiStrategy = (config) => ({
    name: 'ema_rsi',
    run: ({ candles, instrument, interval, assetType }) => {
        if (candles.length < Math.max(config.emaSlowPeriod, config.rsiPeriod) + 2) {
            return null;
        }
        const closes = candles.map((candle) => candle.close);
        const emaFast = (0, indicators_1.ema)(closes, config.emaFastPeriod);
        const emaSlow = (0, indicators_1.ema)(closes, config.emaSlowPeriod);
        const rsiValues = (0, indicators_1.rsi)(closes, config.rsiPeriod);
        const lastIndex = candles.length - 1;
        const prevIndex = candles.length - 2;
        const prevFast = emaFast[prevIndex];
        const prevSlow = emaSlow[prevIndex];
        const currFast = emaFast[lastIndex];
        const currSlow = emaSlow[lastIndex];
        const currRsi = rsiValues[lastIndex];
        const latest = candles[lastIndex];
        if (prevFast <= prevSlow && currFast > currSlow && currRsi < config.rsiSellThreshold) {
            return {
                source: 'BINANCE',
                assetType,
                instrument,
                interval,
                strategy: 'ema_rsi',
                kind: 'ENTRY',
                side: 'BUY',
                price: latest.close,
                time: latest.closeTime,
                confidence: 78,
                tags: ['ema_cross', 'rsi_filter', 'trend'],
                reason: `EMA${config.emaFastPeriod} crossed above EMA${config.emaSlowPeriod} with RSI ${currRsi.toFixed(2)}.`,
            };
        }
        if (prevFast >= prevSlow && currFast < currSlow && currRsi > config.rsiBuyThreshold) {
            return {
                source: 'BINANCE',
                assetType,
                instrument,
                interval,
                strategy: 'ema_rsi',
                kind: 'ENTRY',
                side: 'SELL',
                price: latest.close,
                time: latest.closeTime,
                confidence: 78,
                tags: ['ema_cross', 'rsi_filter', 'trend'],
                reason: `EMA${config.emaFastPeriod} crossed below EMA${config.emaSlowPeriod} with RSI ${currRsi.toFixed(2)}.`,
            };
        }
        return null;
    },
});
exports.createEmaRsiStrategy = createEmaRsiStrategy;
//# sourceMappingURL=ema-rsi.strategy.js.map