import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService, RedisService } from '@libs/core';
import { randomUUID } from 'crypto';
import { FeedConfig, feedsConfig, NewsFeedConfig, PricesFeedConfig } from './feeds.config';
import { TelegramPublisherService } from '../telegram/telegram-publisher.service';
import { formatPricesFeedMessage } from './formatters/prices.formatter';
import { formatNewsFeedMessage } from './formatters/news.formatter';
import { NewsFetcherService } from '../news/news-fetcher.service';
import {
  InstrumentMapping,
  ProviderRegistryService,
  normalizeCanonicalSymbol,
  providerSymbolFromCanonical,
  Ticker,
} from '@libs/market-data';
import { MarketDataCacheService } from '../market-data-v3/market-data-cache.service';

const asStringList = (v: unknown): string[] => {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String).map((x) => x.trim()).filter(Boolean);
  if (typeof v === 'string') return v.split(',').map((x) => x.trim()).filter(Boolean);
  return [String(v)].map((x) => x.trim()).filter(Boolean);
};

const uniq = (arr: string[]) => Array.from(new Set(arr));

@Injectable()
export class FeedRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedRunnerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly telegramPublisher: TelegramPublisherService,
    private readonly newsFetcher: NewsFetcherService,
    private readonly marketDataCache: MarketDataCacheService,
  ) { }

  onModuleInit(): void {
    for (const feed of feedsConfig) {
      console.log('helllooooooooooooooo there')
      console.log(feed)
      if (!feed.enabled) continue;
      if (!feed.schedule) continue;

      const job = new CronJob(feed.schedule, () => void this.runFeed(feed));
      this.schedulerRegistry.addCronJob(feed.id, job);
      job.start();
      this.logger.log(`Registered feed ${feed.id} (${feed.type}) @ ${feed.schedule}`);
    }
  }

  onModuleDestroy(): void {
    for (const feed of feedsConfig) {
      if (this.schedulerRegistry.doesExist('cron', feed.id)) {
        this.schedulerRegistry.deleteCronJob(feed.id);
      }
    }
  }

  private async runFeed(feed: FeedConfig): Promise<void> {
    const runId = randomUUID();
    const startedAt = Date.now();

    this.logger.log(JSON.stringify({ event: 'feed_run_start', feedId: feed.id, runId, type: feed.type }));

    try {
      switch (feed.type) {
        case 'prices':
          await this.runPricesFeed(feed as PricesFeedConfig, runId);
          break;
        case 'news':
          await this.runNewsFeed(feed as NewsFeedConfig, runId);
          break;
        default:
          this.logger.warn(JSON.stringify({ event: 'feed_unknown_type', feedId: feed.id, runId, type: (feed as any).type }));
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(JSON.stringify({ event: 'feed_run_failed', feedId: feed.id, runId, message }));
    } finally {
      this.logger.log(JSON.stringify({ event: 'feed_run_end', feedId: feed.id, runId, durationMs: Date.now() - startedAt }));
    }
  }

  private resolveDestinations(feed: FeedConfig): string[] {
    // feed.destinations can be string[] from config file, keep it safe anyway:
    const direct = asStringList((feed as any).destinations);
    if (direct.length > 0) return uniq(direct);

    const key =
      feed.type === 'prices'
        ? 'FEED_PRICES_DESTINATIONS'
        : feed.type === 'news'
          ? 'FEED_NEWS_DESTINATIONS'
          : 'FEED_SIGNALS_DESTINATIONS';

    // env.schema might parse it to string[] already (csv()) — so get<unknown>
    const raw = this.configService.get<unknown>(key);
    return uniq(asStringList(raw));
  }

  private async runPricesFeed(feed: PricesFeedConfig, runId: string): Promise<void> {
    const destinations = this.resolveDestinations(feed);
    if (destinations.length === 0) {
      this.logger.warn(JSON.stringify({ event: 'feed_no_destinations', feedId: feed.id, runId }));
      return;
    }

    const symbols = uniq(feed.options.symbols.map(normalizeCanonicalSymbol).filter(Boolean));
    if (symbols.length === 0) {
      this.logger.warn(JSON.stringify({ event: 'feed_no_symbols', feedId: feed.id, runId }));
      return;
    }

    const providers = feed.options.providers.length
      ? feed.options.providers
        .map((name) => this.providerRegistry.getProviderByName(name))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
      : this.providerRegistry.getEnabledProviders();

    if (providers.length === 0) {
      this.logger.warn(JSON.stringify({ event: 'feed_no_providers', feedId: feed.id, runId }));
      return;
    }

    const tickersBySymbol = new Map<string, Array<{ provider: string; price: number }>>();

    for (const provider of providers) {
      const providerName = provider.provider;

      // read cache first
      const cached = await this.marketDataCache.getTickers(providerName, symbols);
      const missingSymbols = symbols.filter((s) => !cached.has(s.toUpperCase()));

      // fallback to REST only for missing (with provider-specific symbol mapping)
      if (missingSymbols.length > 0) {
        const mappings = this.buildMappings(providerName, missingSymbols);
        if (mappings.length > 0) {
          try {
            const tickers = await this.fetchTickersInBatches(provider, mappings);
            for (const ticker of tickers) {
              await this.marketDataCache.setTicker(ticker.provider, ticker.canonicalSymbol, {
                provider: ticker.provider,
                symbol: ticker.canonicalSymbol,
                bid: ticker.bid ?? null,
                ask: ticker.ask ?? null,
                last: ticker.last ?? null,
                ts: ticker.ts,
              });
              cached.set(ticker.canonicalSymbol.toUpperCase(), {
                provider: ticker.provider,
                symbol: ticker.canonicalSymbol,
                bid: ticker.bid ?? null,
                ask: ticker.ask ?? null,
                last: ticker.last ?? null,
                ts: ticker.ts,
              });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.warn(
              JSON.stringify({
                event: 'feed_cache_fallback_failed',
                feedId: feed.id,
                runId,
                provider: providerName,
                message,
              }),
            );
          }
        }
      }


      // aggregate from cache
      for (const symbol of symbols) {
        const cachedTicker = cached.get(symbol.toUpperCase());
        if (!cachedTicker || cachedTicker.last === null || !Number.isFinite(cachedTicker.last)) continue;
        if (!tickersBySymbol.has(symbol)) tickersBySymbol.set(symbol, []);
        tickersBySymbol.get(symbol)!.push({ provider: providerName, price: cachedTicker.last });
      }
    }

    const aggregations = Array.from(tickersBySymbol.entries()).map(([symbol, entries]) => {
      const prices = entries.map((e) => e.price).filter(Number.isFinite);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const spreadPct = prices.length > 1 && min > 0 ? ((max - min) / min) * 100 : null;
      return { symbol, entries, spreadPct };
    });

    const message = formatPricesFeedMessage({
      aggregations,
      format: feed.options.format,
      includeTimestamp: feed.options.includeTimestamp,
    });

    for (const chatId of destinations) {
      await this.telegramPublisher.sendMessage(chatId, message, { parseMode: 'HTML' });
    }

    this.logger.log(JSON.stringify({
      event: 'feed_prices_sent',
      feedId: feed.id,
      runId,
      symbols: symbols.length,
      destinations: destinations.length,
    }));
  }

  private buildMappings(provider: string, symbols: string[]): InstrumentMapping[] {
    return symbols
      .map((symbol) => {
        const canonicalSymbol = normalizeCanonicalSymbol(symbol);
        const mapping = providerSymbolFromCanonical(provider, canonicalSymbol);
        if (!mapping) {
          this.logger.warn(JSON.stringify({ event: 'feed_symbol_mapping_failed', provider, symbol: canonicalSymbol }));
          return null;
        }
        return {
          provider,
          canonicalSymbol,
          providerSymbol: mapping.providerSymbol,
          providerInstId: mapping.providerInstId,
          marketType: 'spot',
          isActive: true,
        } as InstrumentMapping;
      })
      .filter((m): m is InstrumentMapping => Boolean(m));
  }

  private async runNewsFeed(feed: NewsFeedConfig, runId: string): Promise<void> {
    const destinations = this.resolveDestinations(feed);
    if (destinations.length === 0) {
      this.logger.warn(JSON.stringify({ event: 'feed_no_destinations', feedId: feed.id, runId }));
      return;
    }

    await this.newsFetcher.fetchAndStoreOnce();

    const lastTsRaw = await this.redisService.get(`feed:last_news_ts:${feed.id}`);
    const lastTs = lastTsRaw ? Number(lastTsRaw) : null;

    const whereClause: { ts?: { gt: Date }; provider?: { in: string[] } } = {};
    if (lastTs) whereClause.ts = { gt: new Date(lastTs) };
    if (feed.options.providers.length > 0) whereClause.provider = { in: feed.options.providers };

    const newsItems = await this.prismaService.news.findMany({
      where: whereClause,
      orderBy: { ts: 'desc' },
      take: feed.options.maxItems,
    });

    if (newsItems.length === 0) {
      this.logger.log(JSON.stringify({ event: 'feed_news_empty', feedId: feed.id, runId }));
      return;
    }

    const message = formatNewsFeedMessage({
      items: [...newsItems].reverse().map((item) => ({
        title: item.title,
        url: item.url,
        provider: item.provider,
        tags: item.tags,
      })),
      includeTags: feed.options.includeTags,
    });

    for (const chatId of destinations) {
      await this.telegramPublisher.sendMessage(chatId, message, { parseMode: 'HTML' });
    }

    const newest = newsItems[0]?.ts?.getTime();
    if (newest) await this.redisService.set(`feed:last_news_ts:${feed.id}`, String(newest));

    this.logger.log(JSON.stringify({
      event: 'feed_news_sent',
      feedId: feed.id,
      runId,
      items: newsItems.length,
      destinations: destinations.length,
    }));
  }

  private async fetchTickersInBatches(
    provider: { provider: string; fetchTickers: (m: InstrumentMapping[]) => Promise<Ticker[]> },
    mappings: InstrumentMapping[],
  ): Promise<Ticker[]> {
    if (!mappings.length) return [];

    const batchSize = Math.max(1, this.configService.get<number>('MARKET_DATA_REST_TICKER_BATCH_SIZE', 10));
    const concurrency = Math.max(1, this.configService.get<number>('MARKET_DATA_REST_TICKER_BATCH_CONCURRENCY', 2));

    const batches: InstrumentMapping[][] = [];
    for (let i = 0; i < mappings.length; i += batchSize) {
      batches.push(mappings.slice(i, i + batchSize));
    }

    const results: Ticker[] = [];
    const queue = [...batches];

    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const batch = queue.shift();
        if (!batch) return;
        try {
          const tickers = await provider.fetchTickers(batch);
          results.push(...tickers);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          this.logger.warn(JSON.stringify({
            event: 'feed_fetch_tickers_batch_failed',
            provider: provider.provider,
            batchSize: batch.length,
            message,
          }));
        }
      }
    });

    await Promise.all(workers);
    return results;
  }
}
