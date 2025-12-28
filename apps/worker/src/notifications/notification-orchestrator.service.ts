import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { ChatConfig } from '@prisma/client';
import { PrismaService, RedisService, SIGNALS_QUEUE_NAME } from '@libs/core';
import { MessageFormatterService } from './formatting/message-formatter.service';
import { NotificationDeliveryRepository } from './delivery/notification-delivery.repository';
import {
  evaluatePolicy,
  NotificationEntityType,
  ChatPreferences,
  SignalSnapshot,
  NewsSnapshot,
  ArbSnapshot,
  EnabledFeatures,
} from './policy/policy-engine';
import { getModePreset } from './policy/mode-presets';

const RATE_LIMIT_TTL_SECONDS = 2 * 60 * 60;
const STATS_BUCKET_TTL_SECONDS = 60 * 60;
const STATS_WINDOW_MINUTES = 15;

@Injectable()
export class NotificationOrchestratorService {
  private readonly logger = new Logger(NotificationOrchestratorService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly deliveryRepository: NotificationDeliveryRepository,
    private readonly formatter: MessageFormatterService,
    @InjectQueue(SIGNALS_QUEUE_NAME)
    private readonly signalsQueue: Queue,
  ) {}

  async handleSignalCreated(signalId: string): Promise<void> {
    await this.handleEntity('SIGNAL', signalId);
  }

  async handleNewsCreated(newsId: string): Promise<void> {
    await this.handleEntity('NEWS', newsId);
  }

  async handleArbCreated(arbId: string): Promise<void> {
    await this.handleEntity('ARB', arbId);
  }

  async getHealthSnapshot(): Promise<{
    orchestratorEnabled: boolean;
    lastProcessedAt: number | null;
    statsLastMinutes: { sent: number; skipped: number };
  }> {
    const orchestratorEnabled = this.isEnabled();
    const lastProcessedRaw = await this.redisService.get('notif:lastProcessedAt');
    const lastProcessedAt = lastProcessedRaw ? Number(lastProcessedRaw) : null;
    const now = new Date();

    const buckets = Array.from({ length: STATS_WINDOW_MINUTES }, (_, index) =>
      this.formatMinuteBucket(new Date(now.getTime() - index * 60_000)),
    );

    const sentKeys = buckets.map((bucket) => `notif:stats:sent:${bucket}`);
    const skippedKeys = buckets.map((bucket) => `notif:stats:skipped:${bucket}`);

    const [sentValues, skippedValues] = await Promise.all([
      sentKeys.length ? this.redisService.mget(...sentKeys) : [],
      skippedKeys.length ? this.redisService.mget(...skippedKeys) : [],
    ]);

    const sumValues = (values: Array<string | null>) =>
      values.reduce((sum, value) => sum + (value ? Number(value) : 0), 0);

    return {
      orchestratorEnabled,
      lastProcessedAt: Number.isFinite(lastProcessedAt ?? NaN) ? lastProcessedAt : null,
      statsLastMinutes: {
        sent: sumValues(sentValues),
        skipped: sumValues(skippedValues),
      },
    };
  }

  private isEnabled(): boolean {
    return this.configService.get<boolean>('NOTIFICATION_ORCHESTRATOR_ENABLED', true);
  }

  private async handleEntity(entityType: NotificationEntityType, entityId: string): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.debug(
        JSON.stringify({ event: 'orchestrator_disabled', entityType, entityId }),
      );
      return;
    }

    const now = new Date();
    const entity = await this.loadEntity(entityType, entityId);
    if (!entity) {
      this.logger.warn(
        JSON.stringify({ event: 'orchestrator_entity_missing', entityType, entityId }),
      );
      return;
    }

    const chatConfigs = await this.prismaService.chatConfig.findMany({
      where: { isEnabled: true },
    });

    if (chatConfigs.length === 0) {
      this.logger.warn(
        JSON.stringify({ event: 'orchestrator_no_chats', entityType, entityId }),
      );
      return;
    }

    const summary = {
      totalChats: chatConfigs.length,
      sentCount: 0,
      skippedCount: 0,
      skippedReasons: {} as Record<string, number>,
    };

    for (const chatConfig of chatConfigs) {
      const targetChatId = this.getTargetChatId(chatConfig);
      if (!targetChatId) {
        await this.recordSkipped(entityType, entityId, chatConfig.chatId, 'chat_disabled');
        this.bumpSkip(summary, 'chat_disabled');
        continue;
      }

      const preferences = this.buildPreferences(chatConfig);
      const baseDecision = evaluatePolicy({
        entityType,
        preferences,
        now,
        signal: entityType === 'SIGNAL' ? (entity as SignalSnapshot) : undefined,
        news: entityType === 'NEWS' ? (entity as NewsSnapshot) : undefined,
        arb: entityType === 'ARB' ? (entity as ArbSnapshot) : undefined,
        rateLimitHit: false,
        cooldownHit: false,
      });

      if (!baseDecision.allowed) {
        await this.recordSkipped(entityType, entityId, targetChatId, baseDecision.reason ?? 'blocked');
        this.bumpSkip(summary, baseDecision.reason ?? 'blocked');
        continue;
      }

      const rateLimitHit = await this.isRateLimited(targetChatId, preferences);
      const cooldownHit = rateLimitHit
        ? false
        : await this.isCooldownActive(targetChatId, entityType, entity, preferences);
      const decision = evaluatePolicy({
        entityType,
        preferences,
        now,
        signal: entityType === 'SIGNAL' ? (entity as SignalSnapshot) : undefined,
        news: entityType === 'NEWS' ? (entity as NewsSnapshot) : undefined,
        arb: entityType === 'ARB' ? (entity as ArbSnapshot) : undefined,
        rateLimitHit,
        cooldownHit,
      });

      if (!decision.allowed) {
        await this.recordSkipped(entityType, entityId, targetChatId, decision.reason ?? 'blocked');
        this.bumpSkip(summary, decision.reason ?? 'blocked');
        continue;
      }

      const existing = await this.deliveryRepository.findExisting(entityType, entityId, targetChatId);
      if (existing) {
        this.bumpSkip(summary, 'duplicate');
        continue;
      }

      const delivery = await this.deliveryRepository
        .createDelivery({
          entityType,
          entityId,
          chatId: targetChatId,
          status: 'SENT',
        })
        .catch((error: unknown) => {
          if (this.isUniqueViolation(error)) {
            this.bumpSkip(summary, 'duplicate');
            return null;
          }
          throw error;
        });

      if (!delivery) {
        continue;
      }

      try {
        await this.enqueueNotification(entityType, entity, targetChatId, delivery.id);
        summary.sentCount += 1;
        await this.trackStats('sent');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        await this.deliveryRepository.updateDeliveryStatus({
          id: delivery.id,
          status: 'FAILED',
          reason: message,
        });
        this.bumpSkip(summary, 'queue_failed');
      }
    }

    await this.redisService.set('notif:lastProcessedAt', String(Date.now()), 'EX', 86400);
    this.logger.log(
      JSON.stringify({
        event: 'orchestrator_summary',
        entityType,
        entityId,
        ...summary,
      }),
    );
  }

  private async loadEntity(entityType: NotificationEntityType, entityId: string) {
    switch (entityType) {
      case 'SIGNAL':
        return this.prismaService.signal.findUnique({ where: { id: entityId } });
      case 'NEWS':
        return this.prismaService.news.findUnique({ where: { id: entityId } });
      case 'ARB':
        return this.prismaService.arbOpportunity.findUnique({ where: { id: entityId } });
      default:
        return null;
    }
  }

  private getTargetChatId(chatConfig: { chatId: string; chatType: string; sendToGroup: boolean; sendToChannel: boolean }): string | null {
    if (chatConfig.chatType === 'group' && !chatConfig.sendToGroup) {
      return null;
    }
    if (chatConfig.chatType === 'channel' && !chatConfig.sendToChannel) {
      return null;
    }
    return chatConfig.chatId;
  }

  private buildPreferences(chatConfig: ChatConfig): ChatPreferences {
    const enabledFeatures = this.parseEnabledFeatures(chatConfig.enabledFeatures);

    return {
      chatId: chatConfig.chatId,
      mode: chatConfig.mode ?? this.configService.get<string>('NOTIF_MODE_DEFAULT', 'NORMAL'),
      watchlist: chatConfig.watchlist ?? [],
      enabledProviders: chatConfig.enabledProviders ?? [],
      enabledFeatures,
      quietHoursEnabled:
        chatConfig.quietHoursEnabled ??
        this.configService.get<boolean>('NOTIF_QUIET_HOURS_DEFAULT_ENABLED', true),
      quietHoursStart:
        chatConfig.quietHoursStart ??
        this.configService.get<string>('NOTIF_QUIET_HOURS_DEFAULT_START', '23:00'),
      quietHoursEnd:
        chatConfig.quietHoursEnd ??
        this.configService.get<string>('NOTIF_QUIET_HOURS_DEFAULT_END', '08:00'),
      maxNotifsPerHour:
        chatConfig.maxNotifsPerHour ??
        this.configService.get<number>('NOTIF_MAX_PER_HOUR_DEFAULT', 12),
      cooldownSignalsSec:
        chatConfig.cooldownSignalsSec ??
        this.configService.get<number>('NOTIF_COOLDOWN_SIGNALS_DEFAULT', 600),
      cooldownNewsSec:
        chatConfig.cooldownNewsSec ??
        this.configService.get<number>('NOTIF_COOLDOWN_NEWS_DEFAULT', 1800),
      cooldownArbSec:
        chatConfig.cooldownArbSec ??
        this.configService.get<number>('NOTIF_COOLDOWN_ARB_DEFAULT', 300),
      minConfidence:
        chatConfig.minConfidence ??
        this.configService.get<number>('NOTIF_MIN_CONFIDENCE_DEFAULT', 60),
      digestEnabled:
        chatConfig.digestEnabled ??
        this.configService.get<boolean>('NOTIF_DIGEST_ENABLED_DEFAULT', false),
      digestTimes: chatConfig.digestTimes ?? this.getDigestTimesDefault(),
      assetsEnabled: chatConfig.assetsEnabled ?? [],
      timeframes: chatConfig.timeframes ?? [],
      mutedUntil: chatConfig.mutedUntil ?? undefined,
      mutedInstruments: chatConfig.mutedInstruments ?? [],
    };
  }

  private getDigestTimesDefault(): string[] {
    const raw = this.configService.get<unknown>('NOTIF_DIGEST_TIMES_DEFAULT', []);
    if (Array.isArray(raw)) {
      return raw.map((item) => String(item)).filter(Boolean);
    }
    if (typeof raw === 'string') {
      return raw
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  private parseEnabledFeatures(raw: unknown): EnabledFeatures {
    if (raw && typeof raw === 'object') {
      const record = raw as Record<string, unknown>;
      return {
        signals: record.signals !== false,
        news: record.news !== false,
        arbitrage: record.arbitrage !== false,
      };
    }

    return {
      signals: true,
      news: true,
      arbitrage: true,
    };
  }

  private async isRateLimited(chatId: string, preferences: ChatPreferences): Promise<boolean> {
    const modePreset = getModePreset(preferences.mode);
    const maxPerHour = modePreset.maxNotifsPerHour ?? preferences.maxNotifsPerHour;
    if (maxPerHour <= 0) return true;

    const key = `rl:chat:${chatId}:hour:${this.formatHourBucket(new Date())}`;
    const count = await this.redisService.incr(key);
    if (count === 1) {
      await this.redisService.expire(key, RATE_LIMIT_TTL_SECONDS);
    }

    return count > maxPerHour;
  }

  private async isCooldownActive(
    chatId: string,
    entityType: NotificationEntityType,
    entity: SignalSnapshot | NewsSnapshot | ArbSnapshot,
    preferences: ChatPreferences,
  ): Promise<boolean> {
    const { key, ttl } = this.buildCooldownKey(chatId, entityType, entity, preferences);
    if (!key || ttl <= 0) return false;

    const result = await this.redisService.set(key, '1', 'EX', ttl, 'NX');
    return result !== 'OK';
  }

  private buildCooldownKey(
    chatId: string,
    entityType: NotificationEntityType,
    entity: SignalSnapshot | NewsSnapshot | ArbSnapshot,
    preferences: ChatPreferences,
  ): { key: string | null; ttl: number } {
    if (entityType === 'SIGNAL') {
      const signal = entity as SignalSnapshot;
      const scope = `${signal.instrument}:${signal.interval}:${signal.strategy}`;
      return {
        key: `cd:chat:${chatId}:${entityType}:${scope}`,
        ttl: preferences.cooldownSignalsSec,
      };
    }

    if (entityType === 'NEWS') {
      const news = entity as NewsSnapshot;
      const scope = `${news.provider}:${news.category}:${this.hashString(news.url)}`;
      return {
        key: `cd:chat:${chatId}:${entityType}:${scope}`,
        ttl: preferences.cooldownNewsSec,
      };
    }

    if (entityType === 'ARB') {
      const arb = entity as ArbSnapshot;
      const scope = `${arb.canonicalSymbol}:${arb.buyExchange}:${arb.sellExchange}`;
      return {
        key: `cd:chat:${chatId}:${entityType}:${scope}`,
        ttl: preferences.cooldownArbSec,
      };
    }

    return { key: null, ttl: 0 };
  }

  private async enqueueNotification(
    entityType: NotificationEntityType,
    entity: SignalSnapshot | NewsSnapshot | ArbSnapshot,
    chatId: string,
    deliveryId: string,
  ): Promise<void> {
    const attempts = this.configService.get<number>('SIGNALS_TELEGRAM_JOB_ATTEMPTS', 5);
    const backoffDelayMs = this.configService.get<number>('SIGNALS_TELEGRAM_JOB_BACKOFF_DELAY_MS', 2000);
    const priority = this.configService.get<number>('SIGNALS_TELEGRAM_JOB_PRIORITY', 1);

    if (entityType === 'SIGNAL') {
      await this.signalsQueue.add(
        'sendTelegramSignal',
        { chatId, signal: entity, notificationDeliveryId: deliveryId },
        {
          priority,
          attempts,
          backoff: { type: 'exponential', delay: backoffDelayMs },
          removeOnComplete: true,
          removeOnFail: { count: 200 },
        },
      );
      return;
    }

    const text =
      entityType === 'NEWS'
        ? this.formatter.formatNews(entity as any)
        : this.formatter.formatArbitrage(entity as any);

    await this.signalsQueue.add(
      'sendTelegramText',
      { chatId, text, parseMode: 'HTML', notificationDeliveryId: deliveryId },
      {
        priority,
        attempts,
        backoff: { type: 'exponential', delay: backoffDelayMs },
        removeOnComplete: true,
        removeOnFail: { count: 200 },
      },
    );
  }

  private async recordSkipped(
    entityType: NotificationEntityType,
    entityId: string,
    chatId: string,
    reason: string,
  ): Promise<void> {
    await this.deliveryRepository
      .createDelivery({
        entityType,
        entityId,
        chatId,
        status: 'SKIPPED',
        reason,
      })
      .catch((error: unknown) => {
        if (this.isUniqueViolation(error)) {
          return;
        }
        throw error;
      });
    await this.trackStats('skipped');
  }

  private bumpSkip(summary: { skippedCount: number; skippedReasons: Record<string, number> }, reason: string) {
    summary.skippedCount += 1;
    summary.skippedReasons[reason] = (summary.skippedReasons[reason] ?? 0) + 1;
  }

  private async trackStats(status: 'sent' | 'skipped'): Promise<void> {
    const bucket = this.formatMinuteBucket(new Date());
    const key = `notif:stats:${status}:${bucket}`;
    const count = await this.redisService.incr(key);
    if (count === 1) {
      await this.redisService.expire(key, STATS_BUCKET_TTL_SECONDS);
    }
  }

  private formatHourBucket(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    return `${year}${month}${day}${hour}`;
  }

  private formatMinuteBucket(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    const minute = String(date.getUTCMinutes()).padStart(2, '0');
    return `${year}${month}${day}${hour}${minute}`;
  }

  private hashString(value: string): string {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
