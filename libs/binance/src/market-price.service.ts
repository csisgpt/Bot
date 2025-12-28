import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@libs/core';
import { BinanceClient } from './binance.client';

export interface PriceSnapshot {
  symbol: string;
  price: number;
  ts: number;
}

export const normalizeSymbol = (symbol: string): string => symbol.trim().toUpperCase();
export const getPriceCacheKey = (symbol: string, source = 'BINANCE'): string =>
  `md:price:last:${source}:${normalizeSymbol(symbol)}`;
export const getLegacyPriceCacheKey = (symbol: string): string =>
  `price:last:${normalizeSymbol(symbol)}`;

@Injectable()
export class MarketPriceService {
  private readonly logger = new Logger(MarketPriceService.name);
  private readonly ttlSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly binanceClient: BinanceClient,
    configService: ConfigService,
  ) {
    this.ttlSeconds = configService.get<number>('PRICE_CACHE_TTL_SECONDS', 120);
  }

  async getLastPrice(symbol: string): Promise<PriceSnapshot | null> {
    const normalized = normalizeSymbol(symbol);
    const cacheKey = getPriceCacheKey(normalized);
    const legacyKey = getLegacyPriceCacheKey(normalized);
    const cached = await this.redisService.get(cacheKey);

    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { price: number; ts: number };
        if (Number.isFinite(parsed.price) && Number.isFinite(parsed.ts)) {
          return { symbol: normalized, price: parsed.price, ts: parsed.ts };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Failed to parse cached price for ${normalized}: ${message}`);
      }
    }
    const legacyCached = await this.redisService.get(legacyKey);
    if (legacyCached) {
      try {
        const parsed = JSON.parse(legacyCached) as { price: number; ts: number };
        if (Number.isFinite(parsed.price) && Number.isFinite(parsed.ts)) {
          await this.redisService.set(
            cacheKey,
            JSON.stringify({ price: parsed.price, ts: parsed.ts }),
            'EX',
            this.ttlSeconds,
          );
          return { symbol: normalized, price: parsed.price, ts: parsed.ts };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Failed to parse legacy price for ${normalized}: ${message}`);
      }
    }

    try {
      const latest = await this.binanceClient.getLastPrice(normalized);
      const snapshot: PriceSnapshot = {
        symbol: normalized,
        price: latest.price,
        ts: latest.ts,
      };
      await this.redisService.set(
        cacheKey,
        JSON.stringify({ price: snapshot.price, ts: snapshot.ts }),
        'EX',
        this.ttlSeconds,
      );
      return snapshot;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to fetch price for ${normalized}: ${message}`);
      return null;
    }
  }
}
