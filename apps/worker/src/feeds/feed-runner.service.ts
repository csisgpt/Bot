import { Injectable, Logger } from '@nestjs/common';
import { MarketDataCacheService, CachedTicker } from '../market-data-v3/market-data-cache.service';
import { TelegramPublisherService } from '../telegram/telegram-publisher.service';
import {
  InstrumentRegistryService,
  ProviderRegistryService,
  normalizeCanonicalSymbol,
  providerCanHandle,
} from '@libs/market-data';
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
    const timeoutMs = Number(process.env.MARKET_DATA_CACHE_GET_TIMEOUT_MS ?? 8000);
    const cacheTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 8000;

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
    const enabledProviders = new Set(
      this.providerRegistry.getEnabledProviders().map((provider) => provider.provider),
    );
    const providerMappings = new Map<string, ReturnType<typeof this.instrumentRegistry.getMappingsForProvider>>();
    const providerSymbols = new Map<string, string[]>();
    const providersUsed: string[] = [];
    const providersSkipped: Array<{ provider: string; reason: string }> = [];

    const symbolSet = new Set(canonicalSymbols);
    for (const provider of normalizedProviders) {
      if (!this.providerRegistry.getProviderByName(provider) || !enabledProviders.has(provider)) {
        providersSkipped.push({ provider, reason: 'not_enabled' });
        continue;
      }
      const canHandleAny = canonicalSymbols.some((symbol) => providerCanHandle(provider, symbol));
      if (!canHandleAny) {
        providersSkipped.push({ provider, reason: 'cannot_handle_symbol' });
        continue;
      }
      const mappings = this.instrumentRegistry
        .getMappingsForProvider(provider)
        .filter((mapping) => symbolSet.has(mapping.canonicalSymbol));
      if (!mappings.length) {
        const reason =
          provider === 'navasan' || provider === 'bonbast' ? 'missing_required_env' : 'no_mapping';
        providersSkipped.push({ provider, reason });
        continue;
      }
      providerMappings.set(provider, mappings);
      providerSymbols.set(
        provider,
        Array.from(new Set(mappings.map((mapping) => mapping.canonicalSymbol))),
      );
      providersUsed.push(provider);
    }

    const notEnabledProviders = providersSkipped
      .filter((entry) => entry.reason === 'not_enabled')
      .map((entry) => entry.provider);
    if (notEnabledProviders.length) {
      this.logger.warn(
        `[${runId}] prices feed providers not enabled: ${notEnabledProviders.join(', ')}`,
      );
    }

    for (const provider of providersUsed) {
      const mappings = providerMappings.get(provider) ?? [];
      if (mappings.length) {
        await this.marketDataCache.warmCache({ provider, instruments: mappings });
      }
    }

    const providerTickers = new Map<string, CachedTicker[]>();
    let twelvedataAuthFailed = false;
    const tickerTasks = providersUsed.map(async (provider) => {
      const symbolsForProvider = providerSymbols.get(provider) ?? [];
      if (!symbolsForProvider.length) {
        return { provider, cached: [] };
      }
      try {
        const cached = await this.withTimeout(
          this.marketDataCache.getTickersCached({
            provider,
            symbols: symbolsForProvider,
          }),
          cacheTimeoutMs,
          `tickers:${provider}`,
        );
        return { provider, cached };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const tagged = new Error(message);
        (tagged as Error & { provider: string }).provider = provider;
        throw tagged;
      }
    });

    const tickerResults = await Promise.allSettled(tickerTasks);
    for (const result of tickerResults) {
      if (result.status === 'fulfilled') {
        providerTickers.set(result.value.provider, result.value.cached);
      } else {
        const error = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
        const message = error.message;
        const provider = (error as Error & { provider?: string }).provider;
        if (!twelvedataAuthFailed && provider === 'twelvedata' && message.includes('401')) {
          twelvedataAuthFailed = true;
          this.logger.warn(
            'TWELVEDATA_API_KEY invalid/missing; provider disabled for this run.',
          );
          providersSkipped.push({ provider: 'twelvedata', reason: 'auth_error' });
          continue;
        }
        this.logger.warn(
          `[${runId}] prices feed provider fetch failed${provider ? ` (${provider})` : ''}: ${message}`,
        );
      }
    }

    const twelvedataMappings = providerMappings.get('twelvedata');
    if (twelvedataMappings && !twelvedataAuthFailed) {
      const twelvedataTickers = providerTickers.get('twelvedata') ?? [];
      const availableSymbols = new Set(twelvedataTickers.map((ticker) => ticker.symbol));
      for (const mapping of twelvedataMappings) {
        if (!availableSymbols.has(mapping.canonicalSymbol)) {
          this.logger.debug(
            JSON.stringify({
              provider: 'twelvedata',
              canonicalSymbol: mapping.canonicalSymbol,
              providerSymbol: mapping.providerSymbol,
              reason: 'empty_response',
            }),
          );
        }
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

    if (notEnabledProviders.length) {
      message += `\n\n⚠️ Missing providers: ${notEnabledProviders.join(
        ', ',
      )} (check MARKET_DATA_ENABLED_PROVIDERS)`;
    }
    if (twelvedataAuthFailed) {
      message += '\n\n⚠️ TWELVEDATA_API_KEY invalid/missing; TwelveData disabled.';
    }

    await Promise.all(destinations.map((chatId) => this.telegram.sendMessage(chatId, message, { parseMode: 'HTML' })));

    const deliveredSymbolsCount = aggregations.filter((agg) => agg.entries.length > 0).length;
    const missingSymbolsCount = canonicalSymbols.length - deliveredSymbolsCount;
    const providersSkippedSummary = providersSkipped.map((entry) => `${entry.provider}:${entry.reason}`);

    this.logger.log(
      `[${runId}] prices sent: destinations=${destinations.length} providers=${providersUsed.length} symbols=${canonicalSymbols.length}`,
    );
    this.logger.log(
      `[${runId}] prices summary: requestedSymbolsCount=${canonicalSymbols.length} deliveredSymbolsCount=${deliveredSymbolsCount} missingSymbolsCount=${missingSymbolsCount} providersUsed=${providersUsed.join(',') || 'none'} providersSkipped=${providersSkippedSummary.join(',') || 'none'}`,
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
