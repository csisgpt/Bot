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
exports.FeedRegistry = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const binance_spot_candle_feed_1 = require("./binance-spot-candle-feed");
let FeedRegistry = class FeedRegistry {
    constructor(configService, binanceSpotCandleFeed) {
        this.configService = configService;
        this.binanceSpotCandleFeed = binanceSpotCandleFeed;
    }
    getFeed(assetType) {
        const provider = assetType === 'GOLD'
            ? this.configService.get('PRICE_PROVIDER_GOLD', 'BINANCE_SPOT')
            : this.configService.get('PRICE_PROVIDER_CRYPTO', 'BINANCE_SPOT');
        switch (provider) {
            case 'BINANCE_SPOT':
                return this.binanceSpotCandleFeed;
            default:
                throw new Error(`Unsupported price provider ${provider} for ${assetType}`);
        }
    }
};
exports.FeedRegistry = FeedRegistry;
exports.FeedRegistry = FeedRegistry = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        binance_spot_candle_feed_1.BinanceSpotCandleFeed])
], FeedRegistry);
//# sourceMappingURL=feed.registry.js.map