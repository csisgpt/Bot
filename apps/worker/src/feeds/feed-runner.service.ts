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
      this.logger.warn(
        `[${runId}] prices feed has no destinations (check env FEED_PRICES_DESTINATIONS / FEEDS_TELEGRAM_DESTINATIONS / TELEGRAM_CHAT_IDS)`,
      );
      return;
    }

    if (canonicalSymbols.length === 0) {
      this.logger.warn(`[${runId}] prices feed has no symbols`);
      return;
    }

    const normalizedProviders = Array.from(
      new Set(effectiveProviders.map((provider) => provider.trim().toLowerCase()).filter(Boolean)),
    );
    const availableProviders = normalizedProviders.filter(
      (provider) => Boolean(this.providerRegistry.getProviderByName(provider)),
    );
    const missingProviders = normalizedProviders.filter(
      (provider) => !this.providerRegistry.getProviderByName(provider),
    );

    if (missingProviders.length) {
      this.logger.warn(
        `[${runId}] prices feed missing providers: ${missingProviders.join(', ')}`,
      );
    }

    const symbolSet = new Set(canonicalSymbols);
    for (const provider of availableProviders) {
      const mappings = this.instrumentRegistry
        .getMappingsForProvider(provider)
        .filter((mapping) => symbolSet.has(mapping.canonicalSymbol));
      if (mappings.length) {
        await this.marketDataCache.warmCache({ provider, instruments: mappings });
      }
    }

    const providerTickers = new Map<string, CachedTicker[]>();
    const tickerTasks = availableProviders.map(async (provider) => {
      const cached = await this.withTimeout(
        this.marketDataCache.getTickersCached({
          provider,
          symbols: canonicalSymbols,
        }),
        2000,
        `tickers:${provider}`,
      );
      return { provider, cached };
    });

    const tickerResults = await Promise.allSettled(tickerTasks);
    for (const result of tickerResults) {
      if (result.status === 'fulfilled') {
        providerTickers.set(result.value.provider, result.value.cached);
      } else {
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
        this.logger.warn(`[${runId}] prices feed provider fetch failed: ${message}`);
      }
    }

    const aggregations = this.marketDataCache.aggregateBestPrices({
      symbols: canonicalSymbols,
      providerTickers,
    });

    let message = formatPricesFeedMessage({
      aggregations,
      format,
      includeTimestamp,
      timestamp: Date.now(),
    });

    if (missingProviders.length) {
      message += `\n\n⚠️ Missing providers: ${missingProviders.join(
        ', ',
      )} (check MARKET_DATA_ENABLED_PROVIDERS)`;
    }

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
      this.logger.warn(
        `[${runId}] news feed has no destinations (check env FEED_NEWS_DESTINATIONS / FEEDS_TELEGRAM_DESTINATIONS / TELEGRAM_CHAT_IDS)`,
      );
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

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }) as Promise<T>;
  }
}
