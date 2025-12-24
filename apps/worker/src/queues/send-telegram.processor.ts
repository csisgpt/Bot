import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TelegramService } from '@libs/telegram';
import { StrategySignal } from '@libs/signals';

@Processor('signals')
export class SendTelegramProcessor extends WorkerHost {
  constructor(private readonly telegramService: TelegramService) {
    super();
  }

  async process(job: Job<StrategySignal>): Promise<void> {
    if (job.name !== 'sendTelegramSignal') {
      return;
    }

    await this.telegramService.sendSignal(job.data);
  }
}
