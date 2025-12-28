import { Processor, WorkerHost } from '@nestjs/bullmq';
import { MARKET_DATA_QUEUE_NAME } from '@libs/core';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor(MARKET_DATA_QUEUE_NAME)
export class MarketDataProcessor extends WorkerHost {
  private readonly logger = new Logger(MarketDataProcessor.name);

  async process(job: Job): Promise<void> {
    if (job.name === 'candle.close') {
      this.logger.debug('کندل بسته‌شده پردازش شد');
    }
  }
}
