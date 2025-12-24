import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { StrategySignal } from '@libs/signals';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot: Telegraf;
  private readonly channelId: string;
  private readonly groupId: string;

  constructor(configService: ConfigService) {
    const token = configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.channelId = configService.get<string>('TELEGRAM_SIGNAL_CHANNEL_ID', '');
    this.groupId = configService.get<string>('TELEGRAM_SIGNAL_GROUP_ID', '');
    this.bot = new Telegraf(token);
  }

  async sendSignal(signal: StrategySignal): Promise<void> {
    const message = [
      `📈 Signal: ${signal.type}`,
      `Symbol: ${signal.symbol}`,
      `Interval: ${signal.interval}`,
      `Price: ${signal.price.toFixed(4)}`,
      `EMA12: ${signal.emaFast.toFixed(4)}`,
      `EMA26: ${signal.emaSlow.toFixed(4)}`,
      `RSI: ${signal.rsi.toFixed(2)}`,
      `Time: ${new Date(signal.time).toISOString()}`,
    ].join('\n');

    if (this.channelId) {
      await this.bot.telegram.sendMessage(this.channelId, message);
    }

    if (this.groupId) {
      await this.bot.telegram.sendMessage(this.groupId, message);
    }

    if (!this.channelId && !this.groupId) {
      this.logger.warn('No Telegram destination configured.');
    }
  }
}
