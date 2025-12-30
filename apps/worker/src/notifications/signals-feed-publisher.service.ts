import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@libs/core';
import { Signal } from '@libs/signals';
import { feedsConfig, SignalsFeedConfig } from '../feeds/feeds.config';
import { TelegramPublisherService } from '../telegram/telegram-publisher.service';
import { formatSignalFeedMessage } from '../feeds/formatters/signals.formatter';

@Injectable()
export class SignalsFeedPublisherService {
  private readonly logger = new Logger(SignalsFeedPublisherService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly telegramPublisher: TelegramPublisherService,
  ) {}

  async publishSignal(signalId: string): Promise<void> {
    const feeds = feedsConfig.filter(
      (feed): feed is SignalsFeedConfig => feed.enabled && feed.type === 'signals',
    );
    if (feeds.length === 0) {
      return;
    }

    const signalRecord = await this.prismaService.signal.findUnique({
      where: { id: signalId },
    });
    if (!signalRecord) {
      return;
    }

    const signal: Signal = {
      id: signalRecord.id,
      source: signalRecord.source as Signal['source'],
      assetType: signalRecord.assetType as Signal['assetType'],
      instrument: signalRecord.instrument,
      interval: signalRecord.interval,
      strategy: signalRecord.strategy,
      kind: signalRecord.kind as Signal['kind'],
      side: signalRecord.side as Signal['side'],
      price: signalRecord.price ?? null,
      time: signalRecord.time.getTime(),
      confidence: signalRecord.confidence,
      tags: signalRecord.tags ?? [],
      reason: signalRecord.reason,
      why: signalRecord.why ?? undefined,
      indicators: signalRecord.indicators as Signal['indicators'],
      levels: signalRecord.levels as Signal['levels'],
      sl: signalRecord.sl ?? undefined,
      tp1: signalRecord.tp1 ?? undefined,
      tp2: signalRecord.tp2 ?? undefined,
      externalId: signalRecord.externalId ?? undefined,
      rawPayload: signalRecord.rawPayload ?? undefined,
    };

    const message = formatSignalFeedMessage(signal);

    for (const feed of feeds) {
      if (feed.options.mode !== 'realtime') {
        continue;
      }
      if (feed.destinations.length === 0) {
        continue;
      }
      for (const chatId of feed.destinations) {
        await this.telegramPublisher.sendMessage(chatId, message, { parseMode: 'HTML' });
      }
    }

    this.logger.log(
      JSON.stringify({
        event: 'signal_feed_published',
        signalId,
        destinations: feeds.flatMap((feed) => feed.destinations).length,
      }),
    );
  }
}
