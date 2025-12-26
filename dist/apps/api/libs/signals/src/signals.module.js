"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalsModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("../../core/src/index");
const binance_1 = require("../../binance/src/index");
const signals_service_1 = require("./signals.service");
const signal_dedupe_service_1 = require("./signal-dedupe.service");
const binance_spot_candle_feed_1 = require("./feeds/binance-spot-candle-feed");
const feed_registry_1 = require("./feeds/feed.registry");
const strategy_registry_1 = require("./strategies/strategy.registry");
let SignalsModule = class SignalsModule {
};
exports.SignalsModule = SignalsModule;
exports.SignalsModule = SignalsModule = __decorate([
    (0, common_1.Module)({
        imports: [core_1.CoreModule, binance_1.BinanceModule],
        providers: [signals_service_1.SignalsService, signal_dedupe_service_1.SignalDedupeService, binance_spot_candle_feed_1.BinanceSpotCandleFeed, feed_registry_1.FeedRegistry, strategy_registry_1.StrategyRegistry],
        exports: [signals_service_1.SignalsService, signal_dedupe_service_1.SignalDedupeService, feed_registry_1.FeedRegistry, strategy_registry_1.StrategyRegistry],
    })
], SignalsModule);
//# sourceMappingURL=signals.module.js.map