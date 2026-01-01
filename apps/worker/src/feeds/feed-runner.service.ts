import { Injectable, Logger } from '@nestjs/common';
import { MarketDataCacheService, CachedTicker } from '../market-data-v3/market-data-cache.service';
import { TelegramPublisherService } from '../telegram/telegram-publisher.service';
import { InstrumentRegistryService, ProviderRegistryService, normalizeCanonicalSymbol } from '@libs/market-data';
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
    private readonly instrumentRegistry: InstrumentRegistryService,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly telegram: TelegramPublisherService,
  ) {}

  async runFeed(feedId: string, type: FeedType): Promise<void> {
    const feed = this.feedConfig.getFeed(feedId, type);
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

    const symbolSet = new Set(canonicalSymbols);
    const enabledProviders = new Set(
      this.providerRegistry.getEnabledProviders().map((provider) => provider.provider),
    );

    for (const provider of effectiveProviders) {
      if (!enabledProviders.has(provider.toLowerCase())) {
        this.logger.warn(`[${runId}] provider not enabled in registry: ${provider}`);
        continue;
      }
      const mappings = this.instrumentRegistry
        .getMappingsForProvider(provider)
        .filter((mapping) => symbolSet.has(mapping.canonicalSymbol));
      if (mappings.length) {
        await this.marketDataCache.warmCache({ provider, instruments: mappings });
      }
    }

    const providerTickers = new Map<string, CachedTicker[]>();
    for (const provider of effectiveProviders) {
      const cached = await this.marketDataCache.getTickersCached({
        provider,
        symbols: canonicalSymbols,
      });
      providerTickers.set(provider, cached);
    }

    const aggregations = this.marketDataCache.aggregateBestPrices({
      symbols: canonicalSymbols,
      providerTickers,
    });

    const message = formatPricesFeedMessage({
      aggregations,
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

    const items = await this.marketDataCache.fetchNews({
      providers: effectiveProviders,
      maxItems,
    });

    const message = formatNewsFeedMessage({
      items,
      includeTags,
    });

    await Promise.all(destinations.map((chatId) => this.telegram.sendMessage(chatId, message, { parseMode: 'HTML' })));

    this.logger.log(`[${runId}] news sent: destinations=${destinations.length} providers=${effectiveProviders.length} items=${items.length}`);
  }
}
