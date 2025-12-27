import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Markup, Telegraf } from 'telegraf';
import { Signal } from '@libs/signals';
import { formatSignalMessage } from './telegram.formatter';
import type { ParseMode } from 'telegraf/types';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot: Telegraf;
  private readonly channelId: string;
  private readonly groupId: string;
  private readonly parseMode: ParseMode;
  private readonly disableWebPreview: boolean;



  constructor(configService: ConfigService) {
    const token = configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

    this.channelId = configService.get<string>('TELEGRAM_SIGNAL_CHANNEL_ID', '');
    this.groupId = configService.get<string>('TELEGRAM_SIGNAL_GROUP_ID', '');

    const pm = (configService.get<string>('TELEGRAM_PARSE_MODE', 'HTML') || 'HTML').toUpperCase();
    this.parseMode =
      pm === 'MARKDOWN' || pm === 'MARKDOWNV2' || pm === 'HTML'
        ? (pm as ParseMode)
        : 'HTML';

    this.disableWebPreview = configService.get<boolean>('TELEGRAM_DISABLE_WEB_PAGE_PREVIEW', true);
    this.bot = new Telegraf(token);
  }

  async sendTestMessage(message: string): Promise<void> {
    await this.sendMessageToDestinations(message);
  }

  async sendSignal(signal: Signal): Promise<void> {
    const destinations: string[] = [];
    if (this.channelId) destinations.push(this.channelId);
    if (this.groupId) destinations.push(this.groupId);

    if (destinations.length === 0) {
      this.logger.warn('No Telegram destination configured.');
      return;
    }

    await Promise.all(destinations.map((chatId) => this.sendSignalToChat(signal, chatId)));
  }

  async sendSignalToChat(signal: Signal, chatId: string): Promise<number> {
    const message = formatSignalMessage(signal);
    const keyboard = this.buildSignalKeyboard(signal);
    const response = await this.bot.telegram.sendMessage(chatId, message, {
      parse_mode: this.parseMode,
      link_preview_options: { is_disabled: this.disableWebPreview },
      reply_markup: keyboard.reply_markup,
    });

    return response.message_id;
  }

  async sendMessage(chatId: string, message: string, parseMode?: ParseMode): Promise<number> {
    const response = await this.bot.telegram.sendMessage(chatId, message, {
      parse_mode: parseMode ?? this.parseMode,
      link_preview_options: { is_disabled: this.disableWebPreview },
    });
    return response.message_id;
  }

  private async sendMessageToDestinations(message: string): Promise<void> {
    if (this.channelId) {
      await this.bot.telegram.sendMessage(this.channelId, message, {
        parse_mode: this.parseMode,
        link_preview_options: { is_disabled: this.disableWebPreview },
      });
    }

    if (this.groupId) {
      await this.bot.telegram.sendMessage(this.groupId, message, {
        parse_mode: this.parseMode,
        link_preview_options: { is_disabled: this.disableWebPreview },
      });
    }

    if (!this.channelId && !this.groupId) {
      this.logger.warn('No Telegram destination configured.');
    }
  }

  private buildSignalKeyboard(signal: Signal) {
    const signalId = signal.id ?? 'unknown';
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ جزئیات', `sig:d:${signalId}`),
        Markup.button.callback('🔔 ساخت هشدار', `sig:a:${signalId}`),
      ],
      [
        Markup.button.callback('⭐ افزودن به واچ\u000cلیست', `sig:w:${signalId}`),
        Markup.button.callback('🔕 بی\u000cصدا (۱ ساعت)', `sig:m:${signalId}`),
      ],
    ]);
  }
}
