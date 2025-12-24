import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BinanceClient } from '@libs/binance';
import { emaRsiStrategy } from '@libs/signals';
import { SignalsService } from '@libs/signals';
import { RedisService } from '@libs/core';

@Injectable()
export class SignalsCron {
  private readonly logger = new Logger(SignalsCron.name);

  constructor(
    private readonly binanceClient: BinanceClient,
    private readonly signalsService: SignalsService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    @InjectQueue('signals') private readonly signalsQueue: Queue,
  ) {}

  @Cron('*/1 * * * *')
  async handleCron(): Promise<void> {
    const symbols = this.configService
      .get<string>('BINANCE_SYMBOLS', 'BTCUSDT')
      .split(',')
      .map((symbol) => symbol.trim())
      .filter(Boolean);
    const interval = this.configService.get<string>('BINANCE_INTERVAL', '1h');
    const ttl = this.configService.get<number>('SIGNAL_DEDUPE_TTL_SECONDS', 3600);

    for (const symbol of symbols) {
      try {
        const klines = await this.binanceClient.getKlines(symbol, interval, 200);
        const signal = emaRsiStrategy(symbol, interval, klines);
        if (!signal) {
          continue;
        }

        const dedupeKey = `signal:${signal.symbol}:${signal.interval}:${signal.time}`;
        const exists = await this.redisService.get(dedupeKey);
        if (exists) {
          continue;
        }

        await this.redisService.set(dedupeKey, '1', 'EX', ttl);
        await this.signalsService.storeSignal(signal);
        await this.signalsQueue.add('sendTelegramSignal', signal, {
          removeOnComplete: true,
          removeOnFail: true,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to process ${symbol}: ${message}`);
      }
    }
  }
}
