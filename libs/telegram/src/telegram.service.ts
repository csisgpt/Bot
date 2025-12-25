import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { Signal } from '@libs/signals';
import { formatSignalMessage } from './telegram.formatter';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot: Telegraf;
  private readonly channelId: string;
  private readonly groupId: string;
  private readonly parseMode: string;
  private readonly disableWebPreview: boolean;

  constructor(configService: ConfigService) {
    const token = configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.channelId = configService.get<string>('TELEGRAM_SIGNAL_CHANNEL_ID', '');
    this.groupId = configService.get<string>('TELEGRAM_SIGNAL_GROUP_ID', '');
    this.parseMode = configService.get<string>('TELEGRAM_PARSE_MODE', 'HTML');
    this.disableWebPreview = configService.get<boolean>('TELEGRAM_DISABLE_WEB_PAGE_PREVIEW', true);
    this.bot = new Telegraf(token);
  }

  async sendTestMessage(message: string): Promise<void> {
    await this.sendMessageToDestinations(message);
  }

  async sendSignal(signal: Signal): Promise<void> {
    const message = formatSignalMessage(signal);
    await this.sendMessageToDestinations(message);
  }

  async sendMessage(chatId: string, message: string, parseMode?: string): Promise<number | undefined> {
    const response = await this.bot.telegram.sendMessage(chatId, message, {
      parse_mode: parseMode ?? this.parseMode,
      disable_web_page_preview: this.disableWebPreview,
    });

    return response?.message_id;
  }

  private async sendMessageToDestinations(message: string): Promise<void> {
    if (this.channelId) {
      await this.bot.telegram.sendMessage(this.channelId, message, {
        parse_mode: this.parseMode,
        disable_web_page_preview: this.disableWebPreview,
      });
    }

    if (this.groupId) {
      await this.bot.telegram.sendMessage(this.groupId, message, {
        parse_mode: this.parseMode,
        disable_web_page_preview: this.disableWebPreview,
      });
    }

    if (!this.channelId && !this.groupId) {
      this.logger.warn('No Telegram destination configured.');
    }
  }
}
