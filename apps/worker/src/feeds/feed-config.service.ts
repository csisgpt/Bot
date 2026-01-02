// apps/worker/src/feeds/feed-config.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FeedConfig,
  FeedType,
  feedsConfig,
  NewsFeedConfig,
  NewsFeedOptions,
  PricesFeedConfig,
  PricesFeedOptions,
  SignalsFeedConfig,
} from './feeds.config';

@Injectable()
export class FeedConfigService implements OnModuleInit {
  private readonly logger = new Logger(FeedConfigService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const feedProviders = new Set<string>();

    for (const feed of feedsConfig) {
      // Only prices/news feeds have `providers`
      const providers: string[] =
        feed.type === 'prices'
          ? ((feed.options as PricesFeedOptions).providers ?? [])
          : feed.type === 'news'
            ? ((feed.options as NewsFeedOptions).providers ?? [])
            : [];

      for (const provider of providers) {
        const p = provider.trim().toLowerCase();
        if (p) feedProviders.add(p);
      }
    }

    if (!feedProviders.size) return;

    const defaultEnabled =
      'binance,bybit,okx,coinbase,kraken,kucoin,gateio,mexc,bitfinex,bitstamp';
    const enabledRaw = this.configService.get<string>(
      'MARKET_DATA_ENABLED_PROVIDERS',
      defaultEnabled,
    );

    const enabledProviders = enabledRaw
      .split(',')
      .map((item: string) => item.trim().toLowerCase())
      .filter(Boolean);

    const enabledSet = new Set(enabledProviders);

    const missing = Array.from(feedProviders).filter(
      (p: string) => !enabledSet.has(p),
    );

    if (missing.length) {
      const suggested = Array.from(new Set([...enabledProviders, ...missing])).join(',');
      this.logger.warn(
        `Feed providers missing from MARKET_DATA_ENABLED_PROVIDERS: ${missing.join(
          ', ',
        )}. Set MARKET_DATA_ENABLED_PROVIDERS=${suggested}`,
      );
    }
  }

  getAllFeeds(): FeedConfig[] {
    return feedsConfig;
  }

  getFeed<T extends FeedConfig>(feedId: string, type: FeedType): T {
    const feed = feedsConfig.find((item) => item.id === feedId && item.type === type);
    if (!feed) throw new Error(`Feed config not found: ${feedId} (${type})`);
    if (!feed.enabled) this.logger.warn(`Feed ${feedId} is disabled.`);
    return feed as T;
  }

  getPricesFeedConfig(feedId: string): PricesFeedConfig {
    return this.getFeed<PricesFeedConfig>(feedId, 'prices');
  }

  getNewsFeedConfig(feedId: string): NewsFeedConfig {
    return this.getFeed<NewsFeedConfig>(feedId, 'news');
  }

  getSignalsFeedConfig(feedId: string): SignalsFeedConfig {
    return this.getFeed<SignalsFeedConfig>(feedId, 'signals');
  }
}
