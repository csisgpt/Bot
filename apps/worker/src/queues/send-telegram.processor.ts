import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TelegramService, telegramTextJobSchema } from '@libs/telegram';
import { Signal } from '@libs/signals';
import { SIGNALS_QUEUE_CONCURRENCY, SIGNALS_QUEUE_NAME } from '@libs/core';

@Processor(SIGNALS_QUEUE_NAME, { concurrency: SIGNALS_QUEUE_CONCURRENCY })
export class SendTelegramProcessor extends WorkerHost {
  constructor(private readonly telegramService: TelegramService) {
    super();
  }

  async process(
    job: Job<{ chatId: string; signal: Signal } | { chatId: string; text: string; parseMode?: string }>,
  ): Promise<void> {
    if (job.name === 'sendTelegramSignal') {
      const payload = job.data as { chatId: string; signal: Signal };
      await this.telegramService.sendSignalToChat(payload.signal, payload.chatId);
      return;
    }

    if (job.name === 'sendTelegramText') {
      const payload = telegramTextJobSchema.parse(job.data);
      await this.telegramService.sendMessage(String(payload.chatId), payload.text, payload.parseMode);
    }
  }
}
