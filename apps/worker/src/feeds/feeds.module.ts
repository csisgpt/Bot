// apps/worker/src/feeds/feeds.module.ts

import { Module } from '@nestjs/common';
import { FeedRunnerService } from './feed-runner.service';
import { FeedConfigService } from './feed-config.service';
import { FeedsScheduler } from './feeds.scheduler';
import { TelegramPublisherModule } from '../telegram/telegram-publisher.module';
import { MarketDataV3Module } from '../market-data-v3/market-data-v3.module';
import { MarketDataModule } from '../market-data/market-data.module';

@Module({
  imports: [TelegramPublisherModule, MarketDataV3Module, MarketDataModule],
  providers: [FeedRunnerService, FeedConfigService, FeedsScheduler],
  exports: [FeedRunnerService],
})
export class FeedsModule {}