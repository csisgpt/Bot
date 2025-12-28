import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@libs/core';
import { NewsProvider, NewsItem } from '@libs/market-data';
import { BinanceNewsProvider } from './providers/binance-news.provider';
import { BybitNewsProvider } from './providers/bybit-news.provider';
import { OkxNewsProvider } from './providers/okx-news.provider';

@Injectable()
export class NewsFetcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NewsFetcherService.name);
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private timer?: NodeJS.Timeout;
  private readonly providers: NewsProvider[];
  private lastFetchAt: number | null = null;
  private lastStoredCount = 0;
  private readonly lastErrorByProvider: Record<string, string | null> = {};

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {
    this.enabled = configService.get<boolean>('NEWS_ENABLED', true);
    this.intervalMs =
      configService.get<number>('NEWS_FETCH_INTERVAL_MINUTES', 5) * 60 * 1000;
    this.providers = [
      new BinanceNewsProvider(configService),
      new BybitNewsProvider(configService),
      new OkxNewsProvider(configService),
    ];
    for (const provider of this.providers) {
      this.lastErrorByProvider[provider.provider] = null;
    }
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('خبرخوانی غیرفعال است');
      return;
    }
    this.timer = setInterval(() => {
      void this.fetchOnce();
    }, this.intervalMs);
    void this.fetchOnce();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async fetchOnce(): Promise<void> {
    const enabledProviders = this.configService
      .get<string>('PROVIDERS_ENABLED', 'binance')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    let totalStored = 0;
    for (const provider of this.providers) {
      if (!enabledProviders.includes(provider.provider)) {
        continue;
      }
      try {
        const rawItems = await provider.fetchLatest();
        const normalized = provider.normalize(rawItems);
        const deduped = provider.dedupe(normalized);
        const stored = await this.storeItems(deduped);
        totalStored += stored;
        this.lastErrorByProvider[provider.provider] = null;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.lastErrorByProvider[provider.provider] = message;
        this.logger.warn(
          JSON.stringify({ event: 'news_fetch_failed', provider: provider.provider, message }),
        );
      }
    }
    this.lastFetchAt = Date.now();
    this.lastStoredCount = totalStored;
  }

  private async storeItems(items: NewsItem[]): Promise<number> {
    if (!items.length) {
      return 0;
    }
    const result = await this.prismaService.news.createMany({
      data: items.map((item) => ({
        provider: item.provider,
        ts: new Date(item.ts),
        title: item.title,
        url: item.url,
        category: item.category,
        tags: item.tags,
        hash: item.hash,
        rawPayload: item,
      })),
      skipDuplicates: true,
    });
    const storedCount = result.count ?? items.length;
    this.logger.log(`خبرهای جدید ذخیره شد: ${storedCount}`);
    return storedCount;
  }

  getHealth(): {
    lastFetchAt: number | null;
    lastStoredCount: number;
    lastErrorByProvider: Record<string, string | null>;
  } {
    return {
      lastFetchAt: this.lastFetchAt,
      lastStoredCount: this.lastStoredCount,
      lastErrorByProvider: { ...this.lastErrorByProvider },
    };
  }
}
