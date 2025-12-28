import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PrismaService, RedisService, SIGNALS_QUEUE_NAME } from '@libs/core';
import { ChatConfig } from '@prisma/client';
import { DateTime } from 'luxon';

interface DigestItemRef {
  entityType: 'SIGNAL' | 'NEWS' | 'ARB';
  entityId: string;
  createdAt: string;
}

@Injectable()
export class DigestCron {
  private readonly logger = new Logger(DigestCron.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    @InjectQueue(SIGNALS_QUEUE_NAME) private readonly signalsQueue: Queue,
  ) {}

  @Cron('*/1 * * * *')
  async handleCron(): Promise<void> {
    const now = new Date();
    const timeZone = this.getTimeZone();
    const chatConfigs = await this.prismaService.chatConfig.findMany({
      where: { isEnabled: true },
    });

    if (chatConfigs.length === 0) {
      return;
    }

    for (const chatConfig of chatConfigs) {
      const digestTimes = this.resolveDigestTimes(chatConfig);
      if (digestTimes.length === 0) continue;

      const targetTime = this.matchDigestTime(now, timeZone, digestTimes);
      if (!targetTime) continue;

      const sentKey = `digest:chat:${chatConfig.chatId}:${this.toDateKey(now, timeZone)}:sent:${targetTime}`;
      const locked = await this.redisService.set(sentKey, '1', 'EX', 3600, 'NX');
      if (!locked) continue;

      await this.sendDigest(chatConfig, now, timeZone);
    }
  }

  private async sendDigest(chatConfig: ChatConfig, now: Date, timeZone: string): Promise<void> {
    const digestKey = this.getDigestKey(chatConfig.chatId, now, timeZone);
    const rawItems = await this.redisService.lrange(digestKey, 0, -1);
    if (!rawItems || rawItems.length === 0) {
      return;
    }

    const refs = rawItems
      .map((item) => {
        try {
          return JSON.parse(item) as DigestItemRef;
        } catch {
          return null;
        }
      })
      .filter((item): item is DigestItemRef => Boolean(item));

    if (refs.length === 0) {
      return;
    }

    const summary = await this.buildSummary(refs);
    if (!summary) {
      return;
    }

    await this.signalsQueue.add(
      'sendTelegramText',
      { chatId: chatConfig.chatId, text: summary, parseMode: 'HTML' },
      { removeOnComplete: true, removeOnFail: { count: 50 } },
    );

    await this.redisService.del(digestKey);
  }

  private async buildSummary(refs: DigestItemRef[]): Promise<string | null> {
    const counts = refs.reduce(
      (acc, item) => {
        acc[item.entityType] = (acc[item.entityType] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    const topRefs = refs.slice(0, 5);
    const lines = ['🧾 <b>خلاصه اعلانها</b>'];

    lines.push(
      `سیگنالها: ${counts.SIGNAL ?? 0} | اخبار: ${counts.NEWS ?? 0} | آربیتراژ: ${counts.ARB ?? 0}`,
    );

    const details: string[] = [];
    for (const item of topRefs) {
      if (item.entityType === 'SIGNAL') {
        const signal = await this.prismaService.signal.findUnique({ where: { id: item.entityId } });
        if (signal) {
          details.push(
            `• سیگنال ${this.escapeHtml(signal.instrument)} (${this.escapeHtml(signal.interval)})`,
          );
        }
      }

      if (item.entityType === 'NEWS') {
        const news = await this.prismaService.news.findUnique({ where: { id: item.entityId } });
        if (news) {
          details.push(`• خبر ${this.escapeHtml(news.title).slice(0, 80)}`);
        }
      }

      if (item.entityType === 'ARB') {
        const arb = await this.prismaService.arbOpportunity.findUnique({ where: { id: item.entityId } });
        if (arb) {
          details.push(
            `• آربیتراژ ${this.escapeHtml(arb.canonicalSymbol)} (${this.escapeHtml(arb.buyExchange)}→${this.escapeHtml(arb.sellExchange)})`,
          );
        }
      }
    }

    if (details.length > 0) {
      lines.push('---');
      lines.push(...details);
    }

    return lines.join('\n');
  }

  private resolveDigestTimes(chatConfig: ChatConfig): string[] {
    if (chatConfig.digestEnabled === false) {
      return [];
    }

    if (chatConfig.digestTimes?.length) {
      return chatConfig.digestTimes;
    }

    const raw = this.configService.get<string | string[]>('NOTIF_DIGEST_TIMES_DEFAULT', []);
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

  private matchDigestTime(now: Date, timeZone: string, times: string[]): string | null {
    const local = DateTime.fromJSDate(now, { zone: timeZone });
    const safe = local.isValid ? local : DateTime.fromJSDate(now, { zone: 'UTC' });
    if (!safe.isValid) return null;

    const current = `${String(safe.hour).padStart(2, '0')}:${String(safe.minute).padStart(2, '0')}`;
    return times.includes(current) ? current : null;
  }

  private getDigestKey(chatId: string, now: Date, timeZone: string): string {
    const dateKey = this.toDateKey(now, timeZone);
    return `digest:chat:${chatId}:${dateKey}:items`;
  }

  private toDateKey(now: Date, timeZone: string): string {
    const local = DateTime.fromJSDate(now, { zone: timeZone });
    const safe = local.isValid ? local : DateTime.fromJSDate(now, { zone: 'UTC' });
    return safe.toISODate() ?? now.toISOString().slice(0, 10);
  }

  private getTimeZone(): string {
    return this.configService.get<string>('APP_TIMEZONE', 'Europe/Berlin');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
