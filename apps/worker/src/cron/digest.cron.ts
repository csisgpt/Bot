import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService, SIGNALS_QUEUE_NAME } from '@libs/core';
import { ChatConfig } from '@prisma/client';

@Injectable()
export class DigestCron {
  private readonly logger = new Logger(DigestCron.name);
  private lastDigestDate: string | null = null;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    @InjectQueue(SIGNALS_QUEUE_NAME) private readonly signalsQueue: Queue,
  ) {}

  @Cron('*/1 * * * *')
  async handleCron(): Promise<void> {
    const enabled = this.configService.get<boolean>('DIGEST_ENABLED', true);
    if (!enabled) return;

    const now = new Date();
    const timeString = this.configService.get<string>('DIGEST_TIME_UTC', '20:00');
    const [targetHour, targetMinute] = timeString.split(':').map(Number);
    if ([targetHour, targetMinute].some((v) => Number.isNaN(v))) {
      this.logger.warn(`Invalid DIGEST_TIME_UTC value: ${timeString}`);
      return;
    }

    if (now.getUTCHours() !== targetHour || now.getUTCMinutes() !== targetMinute) return;

    const digestDate = now.toISOString().slice(0, 10);
    if (this.lastDigestDate === digestDate) return;

    const summary = await this.buildSummary(now);
    if (!summary) return;

    await this.dispatchDigest(summary, now);
    this.lastDigestDate = digestDate;
  }

  private async buildSummary(now: Date): Promise<string | null> {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
    const signals = await this.prismaService.signal.findMany({
      where: {
        createdAt: { gte: start, lte: now },
      },
    });

    if (signals.length === 0) {
      return '🧾 <b>Daily digest</b>\nNo signals today.';
    }

    let buyCount = 0;
    let sellCount = 0;
    const instrumentCounts = new Map<string, number>();
    let totalConfidence = 0;

    for (const signal of signals) {
      if (signal.side === 'BUY') buyCount += 1;
      if (signal.side === 'SELL') sellCount += 1;
      instrumentCounts.set(signal.instrument, (instrumentCounts.get(signal.instrument) ?? 0) + 1);
      totalConfidence += signal.confidence;
    }

    const topInstruments = Array.from(instrumentCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([instrument]) => instrument)
      .join(', ');

    const avgConfidence = totalConfidence / signals.length;

    return [
      '🧾 <b>Daily digest</b>',
      `Signals: ${signals.length} (BUY ${buyCount} / SELL ${sellCount})`,
      `Top instruments: ${topInstruments || 'n/a'}`,
      `Avg confidence: ${avgConfidence.toFixed(1)}%`,
    ].join('\n');
  }

  private async dispatchDigest(message: string, now: Date): Promise<void> {
    const chatConfigs = await this.prismaService.chatConfig.findMany({
      where: { isEnabled: true },
    });

    const postToGroup = this.configService.get<boolean>('DIGEST_POST_TO_GROUP', true);
    const postToChannel = this.configService.get<boolean>('DIGEST_POST_TO_CHANNEL', false);
    const fallbackGroupId = this.configService.get<string>('TELEGRAM_SIGNAL_GROUP_ID', '');
    const fallbackChannelId = this.configService.get<string>('TELEGRAM_SIGNAL_CHANNEL_ID', '');

    const destinations = new Set<string>();

    if (chatConfigs.length === 0) {
      if (postToGroup && fallbackGroupId) destinations.add(fallbackGroupId);
      if (postToChannel && fallbackChannelId) destinations.add(fallbackChannelId);
    } else {
      for (const chatConfig of chatConfigs) {
        if (!this.isDigestAllowedForChat(chatConfig, now)) continue;

        if (chatConfig.chatType === 'group') {
          if (postToGroup && chatConfig.sendToGroup) destinations.add(chatConfig.chatId);
          if (postToChannel && chatConfig.sendToChannel && fallbackChannelId) {
            destinations.add(fallbackChannelId);
          }
        }

        if (chatConfig.chatType === 'channel') {
          if (postToChannel && chatConfig.sendToChannel) destinations.add(chatConfig.chatId);
        }
      }
    }

    if (destinations.size === 0) {
      this.logger.warn('No destinations configured for digest.');
      return;
    }

    for (const chatId of destinations) {
      await this.signalsQueue.add(
        'sendTelegramText',
        { chatId, text: message, parseMode: 'HTML' },
        { removeOnComplete: true, removeOnFail: { count: 50 } },
      );
    }
  }

  private isDigestAllowedForChat(chatConfig: ChatConfig, now: Date): boolean {
    if (!chatConfig.quietHoursEnabled) return true;
    const start = chatConfig.quietHoursStart;
    const end = chatConfig.quietHoursEnd;
    if (!start || !end) return true;

    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    if ([startH, startM, endH, endM].some((v) => Number.isNaN(v))) return true;

    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes === endMinutes) return true;
    if (startMinutes < endMinutes) {
      return !(minutes >= startMinutes && minutes < endMinutes);
    }
    return !(minutes >= startMinutes || minutes < endMinutes);
  }
}
