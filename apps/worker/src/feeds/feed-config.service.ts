// apps/worker/src/feeds/feed-config.service.ts

import { Injectable, Logger } from '@nestjs/common';
import {
  FeedConfig,
  FeedType,
  feedsConfig,
  NewsFeedConfig,
  PricesFeedConfig,
  SignalsFeedConfig,
} from './feeds.config';

@Injectable()
export class FeedConfigService {
  private readonly logger = new Logger(FeedConfigService.name);

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