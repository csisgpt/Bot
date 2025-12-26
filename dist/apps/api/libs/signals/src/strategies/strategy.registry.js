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
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategyRegistry = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ema_rsi_strategy_1 = require("./ema-rsi.strategy");
const rsi_threshold_strategy_1 = require("./rsi-threshold.strategy");
const breakout_strategy_1 = require("./breakout.strategy");
const macd_strategy_1 = require("./macd.strategy");
let StrategyRegistry = class StrategyRegistry {
    constructor(configService) {
        this.configService = configService;
        const rsiPeriod = this.configService.get('RSI_PERIOD', 14);
        const rsiBuyThreshold = this.configService.get('RSI_BUY_THRESHOLD', 30);
        const rsiSellThreshold = this.configService.get('RSI_SELL_THRESHOLD', 70);
        const emaFastPeriod = this.configService.get('EMA_FAST_PERIOD', 12);
        const emaSlowPeriod = this.configService.get('EMA_SLOW_PERIOD', 26);
        const breakoutLookback = this.configService.get('BREAKOUT_LOOKBACK', 20);
        this.strategies = [
            (0, ema_rsi_strategy_1.createEmaRsiStrategy)({
                emaFastPeriod,
                emaSlowPeriod,
                rsiPeriod,
                rsiBuyThreshold,
                rsiSellThreshold,
            }),
            (0, rsi_threshold_strategy_1.createRsiThresholdStrategy)({ rsiPeriod, rsiBuyThreshold, rsiSellThreshold }),
            (0, breakout_strategy_1.createBreakoutStrategy)({ lookback: breakoutLookback }),
            (0, macd_strategy_1.createMacdStrategy)({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }),
        ];
    }
    getAll() {
        return this.strategies;
    }
    getByNames(names) {
        const normalized = names.map((name) => name.trim()).filter(Boolean);
        if (normalized.length === 0) {
            return this.strategies;
        }
        return this.strategies.filter((strategy) => normalized.includes(strategy.name));
    }
};
exports.StrategyRegistry = StrategyRegistry;
exports.StrategyRegistry = StrategyRegistry = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], StrategyRegistry);
//# sourceMappingURL=strategy.registry.js.map