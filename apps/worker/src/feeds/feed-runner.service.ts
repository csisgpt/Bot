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
} from '@libs/market-data';
import { MarketDataCacheService } from '../market-data-v3/market-data-cache.service';

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
  ) {}

  onModuleInit(): void {
    for (const feed of feedsConfig) {
      if (!feed.enabled) continue;
      if (!feed.schedule) {
        continue;
      }

      const job = new CronJob(feed.schedule, () => {
        void this.runFeed(feed);
      });
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
    this.logger.log(
      JSON.stringify({ event: 'feed_run_start', feedId: feed.id, runId, type: feed.type }),
    );

    try {
      if (feed.type === 'prices') {
        await this.runPricesFeed(feed, runId);
      }
      if (feed.type === 'news') {
        await this.runNewsFeed(feed, runId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        JSON.stringify({ event: 'feed_run_failed', feedId: feed.id, runId, message }),
      );
    } finally {
      const durationMs = Date.now() - startedAt;
      this.logger.log(
        JSON.stringify({ event: 'feed_run_end', feedId: feed.id, runId, durationMs }),
      );
    }
  }

  private async runPricesFeed(feed: PricesFeedConfig, runId: string): Promise<void> {
    const destinations = this.resolveDestinations(feed);
    if (destinations.length === 0) {
      this.logger.warn(
        JSON.stringify({ event: 'feed_no_destinations', feedId: feed.id, runId }),
      );
      return;
    }

    const symbols = feed.options.symbols.map(normalizeCanonicalSymbol).filter(Boolean);
    const providers = feed.options.providers.length
      ? feed.options.providers
          .map((name) => this.providerRegistry.getProviderByName(name))
          .filter((provider): provider is NonNullable<typeof provider> => Boolean(provider))
      : this.providerRegistry.getEnabledProviders();

    if (providers.length === 0) {
      this.logger.warn(
        JSON.stringify({ event: 'feed_no_providers', feedId: feed.id, runId }),
      );
      return;
    }

    const tickersBySymbol = new Map<string, Array<{ provider: string; price: number }>>();
    for (const provider of providers) {
      const cached = await this.marketDataCache.getTickers(provider.provider, symbols);
      const missingSymbols = symbols.filter((symbol) => !cached.has(symbol.toUpperCase()));
      if (missingSymbols.length > 0) {
        const mappings = this.buildMappings(provider.provider, missingSymbols);
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
              cached.set(ticker.canonicalSymbol, {
                provider: ticker.provider,
                symbol: ticker.canonicalSymbol,
                bid: ticker.bid ?? null,
                ask: ticker.ask ?? null,
                last: ticker.last ?? null,
                ts: ticker.ts,
              });
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.logger.warn(
              JSON.stringify({
                event: 'feed_cache_fallback_failed',
                feedId: feed.id,
                runId,
                provider: provider.provider,
                message,
              }),
            );
          }
        }
      }

      for (const symbol of symbols) {
        const cachedTicker = cached.get(symbol.toUpperCase());
        if (!cachedTicker || cachedTicker.last === null || !Number.isFinite(cachedTicker.last)) {
          continue;
        }
        if (!tickersBySymbol.has(symbol)) {
          tickersBySymbol.set(symbol, []);
        }
        tickersBySymbol.get(symbol)?.push({
          provider: provider.provider,
          price: cachedTicker.last,
        });
      }
    }

    const aggregations = Array.from(tickersBySymbol.entries()).map(([symbol, entries]) => {
      const prices = entries.map((entry) => entry.price).filter(Number.isFinite);
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const spreadPct = prices.length > 1 && min > 0 ? ((max - min) / min) * 100 : null;
      return {
        symbol,
        entries,
        spreadPct,
      };
    });

    const message = formatPricesFeedMessage({
      aggregations,
      format: feed.options.format,
      includeTimestamp: feed.options.includeTimestamp,
    });

    for (const chatId of destinations) {
      await this.telegramPublisher.sendMessage(chatId, message, { parseMode: 'HTML' });
    }

    this.logger.log(
      JSON.stringify({
        event: 'feed_prices_sent',
        feedId: feed.id,
        runId,
        symbols: symbols.length,
        destinations: destinations.length,
      }),
    );
  }

  private buildMappings(provider: string, symbols: string[]): InstrumentMapping[] {
    return symbols
      .map((symbol) => {
        const canonicalSymbol = normalizeCanonicalSymbol(symbol);
        const mapping = providerSymbolFromCanonical(provider, canonicalSymbol);
        if (!mapping) {
          this.logger.warn(
            JSON.stringify({ event: 'feed_symbol_mapping_failed', provider, symbol }),
          );
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
      .filter((mapping): mapping is InstrumentMapping => Boolean(mapping));
  }

  private async runNewsFeed(feed: NewsFeedConfig, runId: string): Promise<void> {
    const destinations = this.resolveDestinations(feed);
    if (destinations.length === 0) {
      this.logger.warn(
        JSON.stringify({ event: 'feed_no_destinations', feedId: feed.id, runId }),
      );
      return;
    }

    await this.newsFetcher.fetchAndStoreOnce();

    const lastTsRaw = await this.redisService.get(`feed:last_news_ts:${feed.id}`);
    const lastTs = lastTsRaw ? Number(lastTsRaw) : null;
    const whereClause: {
      ts?: { gt: Date };
      provider?: { in: string[] };
    } = {};

    if (lastTs) {
      whereClause.ts = { gt: new Date(lastTs) };
    }
    if (feed.options.providers.length > 0) {
      whereClause.provider = { in: feed.options.providers };
    }

    const newsItems = await this.prismaService.news.findMany({
      where: whereClause,
      orderBy: { ts: 'desc' },
      take: feed.options.maxItems,
    });

    if (newsItems.length === 0) {
      this.logger.log(
        JSON.stringify({ event: 'feed_news_empty', feedId: feed.id, runId }),
      );
      return;
    }

    const ordered = [...newsItems].reverse();
    const message = formatNewsFeedMessage({
      items: ordered.map((item) => ({
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
    if (newest) {
      await this.redisService.set(`feed:last_news_ts:${feed.id}`, String(newest));
    }

    this.logger.log(
      JSON.stringify({
        event: 'feed_news_sent',
        feedId: feed.id,
        runId,
        items: newsItems.length,
        destinations: destinations.length,
      }),
    );
  }

  private resolveDestinations(feed: FeedConfig): string[] {
    if (feed.destinations.length > 0) {
      return feed.destinations;
    }
    const key =
      feed.type === 'prices'
        ? 'FEED_PRICES_DESTINATIONS'
        : feed.type === 'news'
        ? 'FEED_NEWS_DESTINATIONS'
        : 'FEED_SIGNALS_DESTINATIONS';
    const raw = this.configService.get<string>(key, '');
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private async fetchTickersInBatches(
    provider: { fetchTickers: (mappings: InstrumentMapping[]) => Promise<any[]> },
    mappings: InstrumentMapping[],
  ): Promise<any[]> {
    if (!mappings.length) {
      return [];
    }
    const batchSize = Math.max(
      1,
      this.configService.get<number>('MARKET_DATA_REST_TICKER_BATCH_SIZE', 10),
    );
    const concurrency = Math.max(
      1,
      this.configService.get<number>('MARKET_DATA_REST_TICKER_BATCH_CONCURRENCY', 2),
    );
    const batches: InstrumentMapping[][] = [];
    for (let i = 0; i < mappings.length; i += batchSize) {
      batches.push(mappings.slice(i, i + batchSize));
    }
    const results: any[] = [];
    const queue = [...batches];
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        const batch = queue.shift();
        if (!batch) {
          return;
        }
        const tickers = await provider.fetchTickers(batch);
        results.push(...tickers);
      }
    });
    await Promise.all(workers);
    return results;
  }
}
