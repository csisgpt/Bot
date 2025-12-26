"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceModule = void 0;
const common_1 = require("@nestjs/common");
const binance_client_1 = require("./binance.client");
const binance_ws_service_1 = require("./binance-ws.service");
const market_price_service_1 = require("./market-price.service");
const core_1 = require("../../core/src/index");
let BinanceModule = class BinanceModule {
};
exports.BinanceModule = BinanceModule;
exports.BinanceModule = BinanceModule = __decorate([
    (0, common_1.Module)({
        imports: [core_1.CoreModule],
        providers: [binance_client_1.BinanceClient, binance_ws_service_1.BinanceWsService, market_price_service_1.MarketPriceService],
        exports: [binance_client_1.BinanceClient, binance_ws_service_1.BinanceWsService, market_price_service_1.MarketPriceService],
    })
], BinanceModule);
//# sourceMappingURL=binance.module.js.map