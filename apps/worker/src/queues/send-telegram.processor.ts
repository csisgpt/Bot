import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TelegramService } from '@libs/telegram';
import { Signal } from '@libs/signals';
import { SIGNALS_QUEUE_NAME } from '@libs/core';

@Processor(SIGNALS_QUEUE_NAME)
export class SendTelegramProcessor extends WorkerHost {
  constructor(private readonly telegramService: TelegramService) {
    super();
  }

  async process(job: Job<Signal>): Promise<void> {
    if (job.name !== 'sendTelegramSignal') {
      return;
    }

    await this.telegramService.sendSignal(job.data);
  }
}
