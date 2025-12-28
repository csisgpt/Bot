import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SIGNALS_QUEUE_NAME } from '@libs/core';
import { MarketPriceService, PriceSnapshot } from '@libs/binance';
import { enqueueTextMessage, formatPriceTickerMessage } from '@libs/telegram';

@Injectable()
export class PriceTickerCron implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PriceTickerCron.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly marketPriceService: MarketPriceService,
    @InjectQueue(SIGNALS_QUEUE_NAME) private readonly signalsQueue: Queue,
  ) {}

  onModuleInit(): void {
    if (this.configService.get<boolean>('MARKET_DATA_INGEST_ENABLED', false)) {
      this.logger.warn('قیمت‌زن قدیمی غیرفعال شد چون بازار چندمنبعی فعال است');
      return;
    }
    const enabled = this.configService.get<boolean>('PRICE_TICKER_ENABLED', false);
    if (!enabled) {
      return;
    }

    const intervalSeconds = this.configService.get<number>('PRICE_TICKER_POST_SECONDS', 10);
    if (intervalSeconds <= 0) {
      this.logger.warn('PRICE_TICKER_POST_SECONDS must be greater than zero.');
      return;
    }

    this.logger.log(`Price ticker enabled (every ${intervalSeconds}s).`);
    this.timer = setInterval(() => {
      void this.handleTick();
    }, intervalSeconds * 1000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async handleTick(): Promise<void> {
    const instruments = this.parseList(
      this.configService.get<string>('PRICE_TICKER_INSTRUMENTS', 'XAUTUSDT'),
    );
    if (instruments.length === 0) {
      this.logger.warn('PRICE_TICKER_INSTRUMENTS is empty.');
      return;
    }

    const snapshots: PriceSnapshot[] = [];
    for (const instrument of instruments) {
      const snapshot = await this.marketPriceService.getLastPrice(instrument);
      if (snapshot) {
        snapshots.push(snapshot);
      } else {
        this.logger.warn(`No price available for ${instrument}.`);
      }
    }

    if (snapshots.length === 0) {
      return;
    }

    const entries = snapshots.map((snapshot) => ({
      symbol: snapshot.symbol,
      price: snapshot.price,
    }));
    const message = formatPriceTickerMessage(entries, Date.now());

    const postToGroup = this.configService.get<boolean>('PRICE_TICKER_POST_TO_GROUP', true);
    const postToChannel = this.configService.get<boolean>('PRICE_TICKER_POST_TO_CHANNEL', true);

    if (postToGroup) {
      const groupId = this.configService.get<string>('TELEGRAM_SIGNAL_GROUP_ID', '');
      if (groupId) {
        await enqueueTextMessage(this.signalsQueue, groupId, message);
      } else {
        this.logger.warn('PRICE_TICKER_POST_TO_GROUP enabled but TELEGRAM_SIGNAL_GROUP_ID missing.');
      }
    }

    if (postToChannel) {
      const channelId = this.configService.get<string>('TELEGRAM_SIGNAL_CHANNEL_ID', '');
      if (channelId) {
        await enqueueTextMessage(this.signalsQueue, channelId, message);
      } else {
        this.logger.warn('PRICE_TICKER_POST_TO_CHANNEL enabled but TELEGRAM_SIGNAL_CHANNEL_ID missing.');
      }
    }
  }

  private parseList(value?: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(String).map((x) => x.trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value.split(',').map((x) => x.trim()).filter(Boolean);
    }
    return [];
  }
}
