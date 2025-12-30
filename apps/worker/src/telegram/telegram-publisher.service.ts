import { Injectable, Logger } from '@nestjs/common';
import type { ParseMode } from 'telegraf/types';
import { TelegramService } from '@libs/telegram';
import { chunkMessage } from '../feeds/formatters/formatting.utils';

@Injectable()
export class TelegramPublisherService {
  private readonly logger = new Logger(TelegramPublisherService.name);

  constructor(private readonly telegramService: TelegramService) {}

  async sendMessage(
    chatId: string,
    html: string,
    options?: { parseMode?: ParseMode },
  ): Promise<number[]> {
    const chunks = chunkMessage(html);
    const messageIds: number[] = [];

    for (const chunk of chunks) {
      try {
        const messageId = await this.telegramService.sendMessage(
          chatId,
          chunk,
          options?.parseMode ?? 'HTML',
        );
        messageIds.push(messageId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          JSON.stringify({ event: 'telegram_publish_failed', chatId, message }),
        );
        throw error;
      }
    }

    return messageIds;
  }
}
