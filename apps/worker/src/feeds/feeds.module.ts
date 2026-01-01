import { Module } from '@nestjs/common';
import { NewsModule } from '../news/news.module';
import { TelegramModule } from '../telegram/telegram.module';
import { TelegramPublisherModule } from '../telegram-publisher/telegram-publisher.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { MarketDataV3Module } from '../market-data-v3/market-data-v3.module';

import { FeedRunnerService } from './feed-runner.service';
import { FeedConfigService } from './feed-config.service';
import { FeedsScheduler } from './feeds.scheduler';

@Module({
  imports: [MarketDataModule, MarketDataV3Module, NewsModule, TelegramModule, TelegramPublisherModule],
  providers: [FeedRunnerService, FeedConfigService, FeedsScheduler],
  exports: [FeedRunnerService],
})
export class FeedsModule {}