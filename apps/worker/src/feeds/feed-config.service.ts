// apps/worker/src/feeds/feed-config.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FeedConfig,
  FeedType,
  feedsConfig,
  NewsFeedConfig,
  PricesFeedConfig,
  SignalsFeedConfig,
} from './feeds.config';

@Injectable()
export class FeedConfigService implements OnModuleInit {
  private readonly logger = new Logger(FeedConfigService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const feedProviders = new Set<string>();
    for (const feed of feedsConfig) {
      const providers = feed.options?.providers ?? [];
      providers
        .map((provider) => provider.trim().toLowerCase())
        .filter(Boolean)
        .forEach((provider) => feedProviders.add(provider));
    }

    if (!feedProviders.size) {
      return;
    }

    const defaultEnabled =
      'binance,bybit,okx,coinbase,kraken,kucoin,gateio,mexc,bitfinex,bitstamp';
    const enabledRaw = this.configService.get<string>(
      'MARKET_DATA_ENABLED_PROVIDERS',
      defaultEnabled,
    );
    const enabledProviders = enabledRaw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    const enabledSet = new Set(enabledProviders);
    const missing = Array.from(feedProviders).filter((provider) => !enabledSet.has(provider));

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
    const feed = feedsConfig.find((item: FeedConfig) => item.id === feedId && item.type === type);
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
