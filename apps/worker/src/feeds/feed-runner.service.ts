
import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

import {
  InstrumentMapping,
  normalizeCanonicalSymbol,
  providerSymbolFromCanonical,
} from '@libs/market-data';

import { TelegramPublisherService } from '../telegram/telegram-publisher.service';
import { MarketDataCacheService } from '../market-data-v3/market-data-cache.service';
import { formatPricesFeedMessage } from './formatters/prices.formatter';
import { formatNewsFeedMessage } from './formatters/news.formatter';
import { FeedConfigService } from './feed-config.service';

type FeedType = 'prices' | 'news';

@Injectable()
export class FeedRunnerService {
  private readonly logger = new Logger(FeedRunnerService.name);

  constructor(
    private readonly feedConfig: FeedConfigService,
    private readonly telegram: TelegramPublisherService,
    private readonly marketDataCache: MarketDataCacheService,
  ) {}

  async runFeed(feedId: string, type: FeedType): Promise<void> {
    const runId = crypto.randomUUID();
    const startedAt = Date.now();

    this.logger.log(JSON.stringify({ event: 'feed_run_start', feedId, runId, type }));

    try {
      if (type === 'prices') {
        await this.runPricesFeed(feedId, runId);
      } else if (type === 'news') {
        await this.runNewsFeed(feedId, runId);
      }
    } finally {
      this.logger.log(
        JSON.stringify({
          event: 'feed_run_end',
          feedId,
          runId,
          durationMs: Date.now() - startedAt,
        }),
      );
    }
  }

  private async runPricesFeed(feedId: string, runId: string): Promise<void> {
    const cfg = this.feedConfig.getPricesFeedConfig(feedId);
    const { providers, symbols, destinations, format, includeTimestamp } = cfg;

    const canonicalSymbols = symbols.map((s) => normalizeCanonicalSymbol(s)).filter(Boolean);

    const providerTickers = new Map<string, any[]>();

    for (const provider of providers) {
      const cached = await this.marketDataCache.getTickersCached({
        provider,
        symbols: canonicalSymbols,
      });

      const missingSymbols = canonicalSymbols.filter(
        (s) => !cached.find((x) => x.symbol === s),
      );

      if (missingSymbols.length) {
        const mappings = this.buildMappings(provider, missingSymbols);
        if (mappings.length) {
          await this.marketDataCache.warmCache({
            provider,
            instruments: mappings,
          });
        }
      }

      const afterWarm = await this.marketDataCache.getTickersCached({
        provider,
        symbols: canonicalSymbols,
      });

      providerTickers.set(provider, afterWarm);
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

    await Promise.all(
      destinations.map((destination) => this.telegram.sendMessage(destination, message)),
    );

    this.logger.log(
      JSON.stringify({
        event: 'feed_prices_sent',
        feedId,
        runId,
        symbols: canonicalSymbols.length,
        destinations: destinations.length,
      }),
    );
  }

  private async runNewsFeed(feedId: string, runId: string): Promise<void> {
    const cfg = this.feedConfig.getNewsFeedConfig(feedId);
    const { providers, destinations, maxItems, includeTags } = cfg;

    const items = await this.marketDataCache.fetchNews({ providers, maxItems });
    if (!items.length) return;

    const message = formatNewsFeedMessage({
      items,
      includeTags,
    });

    await Promise.all(
      destinations.map((destination) => this.telegram.sendMessage(destination, message)),
    );

    this.logger.log(
      JSON.stringify({
        event: 'feed_news_sent',
        feedId,
        runId,
        items: items.length,
        destinations: destinations.length,
      }),
    );
  }

  private buildMappings(provider: string, symbols: string[]): InstrumentMapping[] {
    return symbols
      .map((raw) => {
        const canonicalSymbol = normalizeCanonicalSymbol(raw);
        if (!canonicalSymbol) return null;

        const mapped = providerSymbolFromCanonical(provider, canonicalSymbol);
        if (!mapped) {
          this.logger.debug(
            JSON.stringify({
              event: 'feed_symbol_mapping_failed',
              provider,
              symbol: canonicalSymbol,
            }),
          );
          return null;
        }

        const mapping: InstrumentMapping = {
          provider,
          canonicalSymbol,
          providerSymbol: mapped.providerSymbol,
          providerInstId: mapped.providerInstId,
          marketType: 'spot',
          isActive: true,
        };

        return mapping;
      })
      .filter((x): x is InstrumentMapping => Boolean(x));
  }
}