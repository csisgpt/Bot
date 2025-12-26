import { ConfigService } from '@nestjs/config';
import { RedisService } from '@libs/core';
import { BinanceClient } from './binance.client';
export interface PriceSnapshot {
    symbol: string;
    price: number;
    ts: number;
}
export declare const normalizeSymbol: (symbol: string) => string;
export declare const getPriceCacheKey: (symbol: string) => string;
export declare class MarketPriceService {
    private readonly redisService;
    private readonly binanceClient;
    private readonly logger;
    private readonly ttlSeconds;
    constructor(redisService: RedisService, binanceClient: BinanceClient, configService: ConfigService);
    getLastPrice(symbol: string): Promise<PriceSnapshot | null>;
}
