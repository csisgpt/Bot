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
exports.BinanceClient = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("axios");
let BinanceClient = class BinanceClient {
    constructor(configService) {
        const baseURL = configService.get('BINANCE_REST_BASE_URL') ??
            configService.get('BINANCE_BASE_URL', 'https://api.binance.com');
        const timeout = configService.get('BINANCE_REST_TIMEOUT_MS') ??
            configService.get('BINANCE_REQUEST_TIMEOUT_MS', 10000);
        this.http = axios_1.default.create({
            baseURL,
            timeout,
        });
    }
    async getKlines(symbol, interval, limit = 200) {
        const response = await this.http.get('/api/v3/klines', {
            params: {
                symbol,
                interval,
                limit,
            },
        });
        return response.data.map((item) => ({
            openTime: Number(item[0]),
            open: Number(item[1]),
            high: Number(item[2]),
            low: Number(item[3]),
            close: Number(item[4]),
            volume: Number(item[5]),
            closeTime: Number(item[6]),
        }));
    }
    async getLastPrice(symbol) {
        const response = await this.http.get('/api/v3/ticker/price', {
            params: { symbol },
        });
        const payload = response.data;
        return {
            symbol: payload.symbol,
            price: Number(payload.price),
            ts: Date.now(),
        };
    }
};
exports.BinanceClient = BinanceClient;
exports.BinanceClient = BinanceClient = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], BinanceClient);
//# sourceMappingURL=binance.client.js.map