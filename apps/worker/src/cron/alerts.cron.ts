import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { FeedRegistry } from '@libs/signals';
import { PrismaService, SIGNALS_QUEUE_NAME } from '@libs/core';

@Injectable()
export class AlertsCron {
  private readonly logger = new Logger(AlertsCron.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly feedRegistry: FeedRegistry,
    private readonly configService: ConfigService,
    @InjectQueue(SIGNALS_QUEUE_NAME) private readonly signalsQueue: Queue,
  ) {}

  @Cron('*/1 * * * *')
  async handleCron(): Promise<void> {
    const now = new Date();
    const alerts = await this.prismaService.alertRule.findMany({
      where: {
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });

    if (alerts.length === 0) return;

    const priceCache = new Map<string, number>();

    for (const alert of alerts) {
      try {
        const price = await this.getCurrentPrice(alert.instrument, priceCache);
        if (price === undefined) continue;

        if (!this.isTriggered(alert, price)) continue;

        await this.prismaService.alertRule.update({
          where: { id: alert.id },
          data: { isActive: false },
        });

        const message = this.renderAlertMessage(alert.instrument, alert.type, price, alert.threshold);
        await this.signalsQueue.add(
          'sendTelegramText',
          { chatId: alert.userId, text: message, parseMode: 'HTML' },
          { removeOnComplete: true, removeOnFail: { count: 50 } },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Alert evaluation failed for ${alert.instrument}: ${message}`);
      }
    }
  }

  private renderAlertMessage(
    instrument: string,
    type: string,
    price: number,
    threshold?: number | null,
  ): string {
    const thresholdLabel =
      type === 'UP_PCT'
        ? `٪${threshold ?? 0}+`
        : type === 'DOWN_PCT'
          ? `٪${threshold ?? 0}-`
          : 'هدف ۱';
    return `🔔 <b>هشدار فعال شد</b>\n<b>${this.escapeHtml(instrument)}</b> ${thresholdLabel}\nقیمت: ${price.toFixed(4)}`;
  }

  private async getCurrentPrice(
    instrument: string,
    cache: Map<string, number>,
  ): Promise<number | undefined> {
    if (cache.has(instrument)) return cache.get(instrument);

    const assetType = this.resolveAssetType(instrument);
    const feed = this.feedRegistry.getFeed(assetType);
    const interval = this.configService.get<string>('BINANCE_INTERVAL', '15m');
    const candles = await feed.getCandles({ instrument, interval, limit: 1 });
    if (candles.length === 0) return undefined;

    const price = candles[candles.length - 1].close;
    cache.set(instrument, price);
    return price;
  }

  private resolveAssetType(instrument: string): 'GOLD' | 'CRYPTO' {
    const goldInstruments = this.normalizeCsv(
      this.configService.get<string>('GOLD_INSTRUMENTS', 'XAUTUSDT'),
    ).map((item) => item.toUpperCase());

    const normalized = instrument.toUpperCase();
    if (normalized.includes('XAU') || goldInstruments.includes(normalized)) {
      return 'GOLD';
    }
    return 'CRYPTO';
  }

  private isTriggered(alert: any, price: number): boolean {
    if (alert.type === 'UP_PCT' && alert.basePrice && alert.threshold != null) {
      return price >= alert.basePrice * (1 + alert.threshold / 100);
    }

    if (alert.type === 'DOWN_PCT' && alert.basePrice && alert.threshold != null) {
      return price <= alert.basePrice * (1 - alert.threshold / 100);
    }

    if (alert.type === 'TP1' && alert.threshold != null) {
      if (alert.basePrice && alert.threshold < alert.basePrice) {
        return price <= alert.threshold;
      }
      return price >= alert.threshold;
    }

    return false;
  }

  private normalizeCsv(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
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
