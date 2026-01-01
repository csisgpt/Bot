import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  constructor(private readonly configService: ConfigService) {}

  getPricesFeedConfig(feedId: string): {
    providers: string[];
    symbols: string[];
    destinations: string[];
    format: 'table' | 'compact';
    includeTimestamp: boolean;
  } {
    const feed = this.getFeedConfig<PricesFeedConfig>(feedId, 'prices');

    const destinations = this.resolveDestinations(feed.destinations);
    if (!destinations.length) {
      this.logger.warn(
        `Feed ${feedId} has no destinations. Set TELEGRAM_SIGNAL_CHANNEL_ID / TELEGRAM_SIGNAL_GROUP_ID.`,
      );
    }

    return {
      providers: feed.options.providers,
      symbols: feed.options.symbols,
      destinations,
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

    const destinations = this.resolveDestinations(feed.destinations);
    if (!destinations.length) {
      this.logger.warn(
        `Feed ${feedId} has no destinations. Set TELEGRAM_SIGNAL_CHANNEL_ID / TELEGRAM_SIGNAL_GROUP_ID.`,
      );
    }

    return {
      providers: feed.options.providers,
      destinations,
      maxItems: feed.options.maxItems,
      includeTags: feed.options.includeTags,
    };
  }

  private resolveDestinations(explicit: string[]): string[] {
    if (explicit?.length) return explicit.filter(Boolean);

    // اگر خواستی بعداً جدا کنی، می‌تونی FEEDS_DEFAULT_DESTINATIONS هم اضافه کنی
    const groupId = this.configService.get<string>('TELEGRAM_SIGNAL_GROUP_ID', '').trim();
    const channelId = this.configService.get<string>('TELEGRAM_SIGNAL_CHANNEL_ID', '').trim();

    return [groupId, channelId].filter(Boolean);
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