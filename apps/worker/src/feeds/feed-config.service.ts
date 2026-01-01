import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeedConfig, FeedDestination, FeedType, feedsConfig, NewsFeedConfig, PricesFeedConfig, SignalsFeedConfig } from './feeds.config';

const parseCsv = (raw?: string): string[] =>
  (raw ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

@Injectable()
export class FeedConfigService {
  constructor(private readonly config: ConfigService) {}

  private resolveDestinations(type: FeedType, explicit: FeedDestination[]): FeedDestination[] {
    if (explicit?.length) return explicit;

    // اولویت: DESTINATIONS اختصاصی هر نوع، بعد DEFAULT
    const typeKey =
      type === 'prices'
        ? 'TELEGRAM_PRICES_DESTINATIONS'
        : type === 'news'
          ? 'TELEGRAM_NEWS_DESTINATIONS'
          : 'TELEGRAM_SIGNALS_DESTINATIONS';

    const csv =
      this.config.get<string>(typeKey) ??
      this.config.get<string>('TELEGRAM_DEFAULT_DESTINATIONS') ??
      '';

    const chatIds = parseCsv(csv);

    return chatIds.map((chatId) => ({ kind: 'telegram', chatId }));
  }

  getFeedConfig<T extends FeedConfig>(feedId: string, type: FeedType): T {
    const feed = feedsConfig.find((item: FeedConfig) => item.id === feedId && item.type === type);
    if (!feed) {
      throw new Error(`Unknown feed: id=${feedId} type=${type}`);
    }
    return feed as T;
  }

  getPricesFeedConfig(feedId: string): {
    id: string;
    destinations: FeedDestination[];
    symbols: string[];
    format: 'table' | 'compact';
    includeTimestamp: boolean;
    maxProvidersPerSymbol: number;
  } {
    const feed = this.getFeedConfig<PricesFeedConfig>(feedId, 'prices');

    return {
      id: feed.id,
      destinations: this.resolveDestinations('prices', feed.destinations),
      symbols: feed.symbols,
      format: feed.format ?? 'compact',
      includeTimestamp: feed.includeTimestamp ?? true,
      maxProvidersPerSymbol: feed.maxProvidersPerSymbol ?? 3,
    };
  }

  getNewsFeedConfig(feedId: string): {
    id: string;
    destinations: FeedDestination[];
    providers: string[];
    limit: number;
  } {
    const feed = this.getFeedConfig<NewsFeedConfig>(feedId, 'news');

    return {
      id: feed.id,
      destinations: this.resolveDestinations('news', feed.destinations),
      providers: feed.providers,
      limit: feed.limit ?? 10,
    };
  }

  getSignalsFeedConfig(feedId: string): {
    id: string;
    destinations: FeedDestination[];
    symbols: string[];
    timeframes: string[];
  } {
    const feed = this.getFeedConfig<SignalsFeedConfig>(feedId, 'signals');

    return {
      id: feed.id,
      destinations: this.resolveDestinations('signals', feed.destinations),
      symbols: feed.symbols,
      timeframes: feed.timeframes,
    };
  }
}