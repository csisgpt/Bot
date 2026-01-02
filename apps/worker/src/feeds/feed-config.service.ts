// apps/worker/src/feeds/feed-config.service.ts

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EXCHANGE_PROVIDERS, IRAN_QUOTES, splitBaseQuote } from '@libs/market-data';
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

    const feedProviders = new Set<string>();
    for (const feed of feedsConfig) {
      const options = feed.options ?? {};
      if ('providers' in options && Array.isArray(options.providers)) {
        options.providers
          .map((provider: string) => provider.trim().toLowerCase())
          .filter(Boolean)
          .forEach((provider: string) => feedProviders.add(provider));
      }
    }

    const missing = Array.from(feedProviders).filter((provider) => !enabledSet.has(provider));

    if (missing.length) {
      const suggested = Array.from(new Set([...enabledProviders, ...missing])).join(',');
      this.logger.warn(
        `Feed providers missing from MARKET_DATA_ENABLED_PROVIDERS: ${missing.join(
          ', ',
        )}. Set MARKET_DATA_ENABLED_PROVIDERS=${suggested}`,
      );
    }

    if (feedProviders.has('twelvedata')) {
      const apiKey = this.configService.get<string>('TWELVEDATA_API_KEY', '').trim();
      if (!apiKey) {
        this.logger.warn('TWELVEDATA_API_KEY is required when FEED_PRICES_PROVIDERS includes twelvedata.');
      }
    }

    const pricesFeed = feedsConfig.find((feed) => feed.type === 'prices');
    const pricesOptions = pricesFeed?.options ?? {};
    const symbols =
      'symbols' in pricesOptions && Array.isArray(pricesOptions.symbols)
        ? pricesOptions.symbols
        : [];
    const hasIranQuotes = symbols.some((symbol: string) => {
      const split = splitBaseQuote(symbol);
      return split ? IRAN_QUOTES.has(split.quote) : false;
    });
    const exchangeEnabled = enabledProviders.some((provider) =>
      EXCHANGE_PROVIDERS.has(provider),
    );
    if (hasIranQuotes && exchangeEnabled) {
      this.logger.warn(
        'Iran-quoted symbols detected in FEED_PRICES_SYMBOLS; exchange providers will be skipped for IRT/IRR pairs.',
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
