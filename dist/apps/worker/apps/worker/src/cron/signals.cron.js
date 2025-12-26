"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SignalsCron_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalsCron = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const signals_1 = require("../../../../libs/signals/src/index");
const core_1 = require("../../../../libs/core/src/index");
let SignalsCron = SignalsCron_1 = class SignalsCron {
    constructor(signalsService, configService, signalDedupeService, feedRegistry, strategyRegistry, signalsQueue) {
        this.signalsService = signalsService;
        this.configService = configService;
        this.signalDedupeService = signalDedupeService;
        this.feedRegistry = feedRegistry;
        this.strategyRegistry = strategyRegistry;
        this.signalsQueue = signalsQueue;
        this.logger = new common_1.Logger(SignalsCron_1.name);
    }
    async handleCron() {
        const assetsEnabled = this.parseList(this.configService.get('ASSETS_ENABLED', 'GOLD,CRYPTO'))
            .map((asset) => asset.toUpperCase())
            .filter((asset) => asset === 'GOLD' || asset === 'CRYPTO');
        const interval = this.configService.get('BINANCE_INTERVAL', '15m');
        const limit = this.configService.get('BINANCE_KLINES_LIMIT', 200);
        const strategiesEnabled = this.parseList(this.configService.get('STRATEGIES_ENABLED', 'ema_rsi'));
        const strategies = this.strategyRegistry.getByNames(strategiesEnabled);
        const riskLevelsEnabled = this.configService.get('ENABLE_RISK_LEVELS', true);
        for (const assetType of assetsEnabled) {
            const feed = this.feedRegistry.getFeed(assetType);
            const instruments = this.getInstrumentsForAsset(assetType);
            for (const instrument of instruments) {
                try {
                    const candles = await feed.getCandles({ instrument, interval, limit });
                    if (!candles || candles.length < 2)
                        continue;
                    for (const strategy of strategies) {
                        const rawSignal = strategy.run({ candles, instrument, interval, assetType });
                        if (!rawSignal)
                            continue;
                        const signal = riskLevelsEnabled
                            ? this.attachRiskLevels(rawSignal, candles)
                            : rawSignal;
                        const shouldProcess = await this.signalDedupeService.isAllowed(signal);
                        if (!shouldProcess)
                            continue;
                        await this.signalsService.storeSignal(signal);
                        await this.signalsQueue.add('sendTelegramSignal', signal, {
                            removeOnComplete: true,
                            removeOnFail: { count: 50 },
                        });
                    }
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : 'Unknown error';
                    this.logger.error(`Failed to process ${assetType}/${instrument}: ${message}`, error);
                }
            }
        }
    }
    parseList(value) {
        return (value ?? '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }
    getInstrumentsForAsset(assetType) {
        if (assetType === 'GOLD') {
            const instruments = this.parseList(this.configService.get('GOLD_INSTRUMENTS', 'XAUTUSDT'));
            return instruments.length > 0 ? instruments : ['XAUTUSDT'];
        }
        const cryptoInstruments = this.parseList(this.configService.get('CRYPTO_INSTRUMENTS', ''));
        if (cryptoInstruments.length > 0)
            return cryptoInstruments;
        const legacy = this.parseList(this.configService.get('BINANCE_SYMBOLS', 'BTCUSDT'));
        return legacy.length > 0 ? legacy : ['BTCUSDT'];
    }
    attachRiskLevels(signal, candles) {
        const period = this.configService.get('ATR_PERIOD', 14);
        const highs = candles.map((c) => c.high);
        const lows = candles.map((c) => c.low);
        const closes = candles.map((c) => c.close);
        const atrValues = (0, signals_1.atr)(highs, lows, closes, period);
        const lastAtr = atrValues[candles.length - 1];
        if (!lastAtr || Number.isNaN(lastAtr)) {
            return signal;
        }
        const price = signal.price ?? null;
        if (price == null || !Number.isFinite(price)) {
            return { ...signal, levels: undefined };
        }
        const slMultiplier = this.configService.get('SL_ATR_MULTIPLIER', 1.5);
        const tp1Multiplier = this.configService.get('TP1_ATR_MULTIPLIER', 2);
        const tp2Multiplier = this.configService.get('TP2_ATR_MULTIPLIER', 3);
        if (signal.side === 'BUY') {
            return {
                ...signal,
                levels: {
                    entry: price,
                    sl: price - lastAtr * slMultiplier,
                    tp1: price + lastAtr * tp1Multiplier,
                    tp2: price + lastAtr * tp2Multiplier,
                },
            };
        }
        if (signal.side === 'SELL') {
            return {
                ...signal,
                levels: {
                    entry: price,
                    sl: price + lastAtr * slMultiplier,
                    tp1: price - lastAtr * tp1Multiplier,
                    tp2: price - lastAtr * tp2Multiplier,
                },
            };
        }
        return { ...signal, levels: undefined };
    }
};
exports.SignalsCron = SignalsCron;
__decorate([
    (0, schedule_1.Cron)('*/1 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SignalsCron.prototype, "handleCron", null);
exports.SignalsCron = SignalsCron = SignalsCron_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(5, (0, bullmq_1.InjectQueue)(core_1.SIGNALS_QUEUE_NAME)),
    __metadata("design:paramtypes", [signals_1.SignalsService,
        config_1.ConfigService,
        signals_1.SignalDedupeService,
        signals_1.FeedRegistry,
        signals_1.StrategyRegistry,
        bullmq_2.Queue])
], SignalsCron);
//# sourceMappingURL=signals.cron.js.map