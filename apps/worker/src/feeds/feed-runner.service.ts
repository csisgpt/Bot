import { Injectable, Logger } from '@nestjs/common';
import { MarketDataCacheService } from '../market-data-v3/market-data-cache.service';
import { MarketDataProvidersService } from '../market-data-v3/market-data-providers.service';
import { TelegramPublisherService } from '../telegram/telegram-publisher.service';
import { normalizeCanonicalSymbol } from '@libs/market-data';
import { formatPricesFeedMessage } from './formatters/prices.formatter';
import { formatNewsFeedMessage } from './formatters/news.formatter';
import { FeedConfigService } from './feed-config.service';
import { FeedType } from './feeds.config';

@Injectable()
export class FeedRunnerService {
  private readonly logger = new Logger(FeedRunnerService.name);

  // simple in-memory cooldown to prevent overlapping runs
  private readonly running = new Set<string>();

  constructor(
    private readonly feedConfig: FeedConfigService,
    private readonly marketDataCache: MarketDataCacheService,
    private readonly providers: MarketDataProvidersService,
    private readonly telegram: TelegramPublisherService,
  ) {}

  async runFeed(feedId: string, type: FeedType): Promise<void> {
    const feed = this.feedConfig.get(feedId, type);
    if (!feed || !feed.enabled) {
      this.logger.debug(`feed disabled or missing: id=${feedId} type=${type}`);
      return;
    }

    const runId = `${feedId}:${Date.now()}`;

    if (this.running.has(feedId)) {
      this.logger.debug(`skip overlapped run: id=${feedId} type=${type}`);
      return;
    }

    this.running.add(feedId);
    try {
      if (type === 'prices') {
        await this.runPricesFeed(feedId, runId);
      } else if (type === 'news') {
        await this.runNewsFeed(feedId, runId);
      } else if (type === 'signals') {
        // سیگنال‌ها معمولاً realtime هستند و از مسیر publisher خودش می‌روند
        this.logger.debug(`signals feed is realtime; scheduler run ignored: id=${feedId}`);
      }
    } finally {
      this.running.delete(feedId);
    }
  }

  private async runPricesFeed(feedId: string, runId: string): Promise<void> {
    const cfg = this.feedConfig.getPricesFeedConfig(feedId);
    const { destinations } = cfg;

    const { providers = [], symbols = [], format = 'table', includeTimestamp = true } = cfg.options ?? {};

    const effectiveProviders = providers.length ? providers : ['binance'];

    const canonicalSymbols = (symbols ?? [])
      .map((s: string) => normalizeCanonicalSymbol(s))
      .filter((s): s is string => Boolean(s));

    if (destinations.length === 0) {
      this.logger.warn(`[${runId}] prices feed has no destinations (check env TELEGRAM_CHAT_IDS / FEEDS_TELEGRAM_DESTINATIONS)`);
      return;
    }

    if (canonicalSymbols.length === 0) {
      this.logger.warn(`[${runId}] prices feed has no symbols`);
      return;
    }

    // ensure symbol mappings exist
    await this.providers.buildMappings({ providers: effectiveProviders, symbols: canonicalSymbols });

    // gather cached tickers for each provider
    const providerTickers = new Map<string, any[]>();
    for (const provider of effectiveProviders) {
      const cached = await this.marketDataCache.getTickersCached(provider, canonicalSymbols);
      providerTickers.set(provider, cached);
    }

    const message = formatPricesFeedMessage({
      aggregations: canonicalSymbols.map((symbol) => ({
        symbol,
        entries: effectiveProviders
          .map((provider) => {
            const list = providerTickers.get(provider) ?? [];
            const hit = list.find((x) => x.symbol === symbol);
            return hit ? { provider, price: hit.price } : null;
          })
          .filter(Boolean) as Array<{ provider: string; price: number }>,
      })),
      format,
      includeTimestamp,
      timestamp: Date.now(),
    });

    await Promise.all(destinations.map((chatId) => this.telegram.sendMessage(chatId, message, { parseMode: 'HTML' })));

    this.logger.log(
      `[${runId}] prices sent: destinations=${destinations.length} providers=${effectiveProviders.length} symbols=${canonicalSymbols.length}`,
    );
  }

  private async runNewsFeed(feedId: string, runId: string): Promise<void> {
    const cfg = this.feedConfig.getNewsFeedConfig(feedId);
    const { destinations } = cfg;

    const { providers = [], maxItems = 10, includeTags = true } = cfg.options ?? {};
    const effectiveProviders = providers.length ? providers : ['bybit'];

    if (destinations.length === 0) {
      this.logger.warn(`[${runId}] news feed has no destinations (check env TELEGRAM_CHAT_IDS / FEEDS_TELEGRAM_DESTINATIONS)`);
      return;
    }

    const items = await this.providers.getNews({ providers: effectiveProviders, maxItems });

    const message = formatNewsFeedMessage({
      items,
      includeTags,
      timestamp: Date.now(),
    });

    await Promise.all(destinations.map((chatId) => this.telegram.sendMessage(chatId, message, { parseMode: 'HTML' })));

    this.logger.log(`[${runId}] news sent: destinations=${destinations.length} providers=${effectiveProviders.length} items=${items.length}`);
  }
}