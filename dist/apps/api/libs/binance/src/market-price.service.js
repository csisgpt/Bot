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
var MarketPriceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketPriceService = exports.getPriceCacheKey = exports.normalizeSymbol = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("../../core/src/index");
const binance_client_1 = require("./binance.client");
const normalizeSymbol = (symbol) => symbol.trim().toUpperCase();
exports.normalizeSymbol = normalizeSymbol;
const getPriceCacheKey = (symbol) => `price:last:${(0, exports.normalizeSymbol)(symbol)}`;
exports.getPriceCacheKey = getPriceCacheKey;
let MarketPriceService = MarketPriceService_1 = class MarketPriceService {
    constructor(redisService, binanceClient, configService) {
        this.redisService = redisService;
        this.binanceClient = binanceClient;
        this.logger = new common_1.Logger(MarketPriceService_1.name);
        this.ttlSeconds = configService.get('PRICE_CACHE_TTL_SECONDS', 120);
    }
    async getLastPrice(symbol) {
        const normalized = (0, exports.normalizeSymbol)(symbol);
        const cacheKey = (0, exports.getPriceCacheKey)(normalized);
        const cached = await this.redisService.get(cacheKey);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (Number.isFinite(parsed.price) && Number.isFinite(parsed.ts)) {
                    return { symbol: normalized, price: parsed.price, ts: parsed.ts };
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                this.logger.warn(`Failed to parse cached price for ${normalized}: ${message}`);
            }
        }
        try {
            const latest = await this.binanceClient.getLastPrice(normalized);
            const snapshot = {
                symbol: normalized,
                price: latest.price,
                ts: latest.ts,
            };
            await this.redisService.set(cacheKey, JSON.stringify({ price: snapshot.price, ts: snapshot.ts }), 'EX', this.ttlSeconds);
            return snapshot;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.logger.warn(`Failed to fetch price for ${normalized}: ${message}`);
            return null;
        }
    }
};
exports.MarketPriceService = MarketPriceService;
exports.MarketPriceService = MarketPriceService = MarketPriceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.RedisService,
        binance_client_1.BinanceClient,
        config_1.ConfigService])
], MarketPriceService);
//# sourceMappingURL=market-price.service.js.map