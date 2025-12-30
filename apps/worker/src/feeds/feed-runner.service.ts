import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { PrismaService, RedisService } from '@libs/core';
import { randomUUID } from 'crypto';
import { FeedConfig, feedsConfig, NewsFeedConfig, PricesFeedConfig } from './feeds.config';
import { ProviderRegistryService } from '../providers/market-data/provider-registry.service';
import { TelegramPublisherService } from '../telegram/telegram-publisher.service';
import { formatPricesFeedMessage } from './formatters/prices.formatter';
import { formatNewsFeedMessage } from './formatters/news.formatter';
import { NewsFetcherService } from '../news/news-fetcher.service';

@Injectable()
export class FeedRunnerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedRunnerService.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly telegramPublisher: TelegramPublisherService,
    private readonly newsFetcher: NewsFetcherService,
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
    if (feed.destinations.length === 0) {
      this.logger.warn(
        JSON.stringify({ event: 'feed_no_destinations', feedId: feed.id, runId }),
      );
      return;
    }

    const providers = feed.options.providers
      .map((name) => this.providerRegistry.getProviderByName(name))
      .filter((provider): provider is NonNullable<typeof provider> => Boolean(provider));

    if (providers.length === 0) {
      this.logger.warn(
        JSON.stringify({ event: 'feed_no_providers', feedId: feed.id, runId }),
      );
      return;
    }

    const results = await Promise.allSettled(
      providers.map(async (provider) => ({
        provider: provider.name,
        tickers: await provider.getTickers({ symbols: feed.options.symbols }),
      })),
    );

    const tickersBySymbol = new Map<string, Array<{ provider: string; price: number }>>();
    for (const result of results) {
      if (result.status === 'rejected') {
        continue;
      }
      for (const ticker of result.value.tickers) {
        if (!tickersBySymbol.has(ticker.symbol)) {
          tickersBySymbol.set(ticker.symbol, []);
        }
        tickersBySymbol.get(ticker.symbol)?.push({
          provider: result.value.provider,
          price: ticker.last,
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

    for (const chatId of feed.destinations) {
      await this.telegramPublisher.sendMessage(chatId, message, { parseMode: 'HTML' });
    }

    this.logger.log(
      JSON.stringify({
        event: 'feed_prices_sent',
        feedId: feed.id,
        runId,
        symbols: feed.options.symbols.length,
        destinations: feed.destinations.length,
      }),
    );
  }

  private async runNewsFeed(feed: NewsFeedConfig, runId: string): Promise<void> {
    if (feed.destinations.length === 0) {
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

    for (const chatId of feed.destinations) {
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
        destinations: feed.destinations.length,
      }),
    );
  }
}
