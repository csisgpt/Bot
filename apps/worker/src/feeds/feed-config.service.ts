import { Injectable, Logger } from '@nestjs/common';
import {
  FeedConfig,
  FeedType,
  feedsConfig,
  NewsFeedConfig,
  PricesFeedConfig,
} from './feeds.config';

@Injectable()
export class FeedConfigService {
  private readonly logger = new Logger(FeedConfigService.name);

  getPricesFeedConfig(feedId: string): {
    providers: string[];
    symbols: string[];
    destinations: string[];
    format: 'table' | 'compact';
    includeTimestamp: boolean;
  } {
    const feed = this.getFeedConfig<PricesFeedConfig>(feedId, 'prices');
    return {
      providers: feed.options.providers,
      symbols: feed.options.symbols,
      destinations: feed.destinations,
      format: feed.options.format,
      includeTimestamp: feed.options.includeTimestamp,
    };
  }

  getNewsFeedConfig(feedId: string): {
    providers: string[];
    destinations: string[];
    maxItems: number;
    includeTags: boolean;
  } {
    const feed = this.getFeedConfig<NewsFeedConfig>(feedId, 'news');
    return {
      providers: feed.options.providers,
      destinations: feed.destinations,
      maxItems: feed.options.maxItems,
      includeTags: feed.options.includeTags,
    };
  }

  private getFeedConfig<T extends FeedConfig>(feedId: string, type: FeedType): T {
    const feed = feedsConfig.find((item) => item.id === feedId && item.type === type);
    if (!feed) {
      throw new Error(`Feed config not found: ${feedId}`);
    }
    if (!feed.enabled) {
      this.logger.warn(`Feed ${feedId} is disabled.`);
    }
    return feed as T;
  }
}
