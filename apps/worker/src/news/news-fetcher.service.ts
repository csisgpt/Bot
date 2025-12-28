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

    for (const provider of this.providers) {
      if (!enabledProviders.includes(provider.provider)) {
        continue;
      }
      try {
        const rawItems = await provider.fetchLatest();
        const normalized = provider.normalize(rawItems);
        const deduped = provider.dedupe(normalized);
        await this.storeItems(deduped);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          JSON.stringify({ event: 'news_fetch_failed', provider: provider.provider, message }),
        );
      }
    }
  }

  private async storeItems(items: NewsItem[]): Promise<void> {
    if (!items.length) {
      return;
    }
    await this.prismaService.news.createMany({
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
    this.logger.log(`خبرهای جدید ذخیره شد: ${items.length}`);
  }
}
