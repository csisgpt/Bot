import { Module } from '@nestjs/common';
import { CoreModule } from '@libs/core';
import { FeedRunnerService } from './feed-runner.service';
import { NewsModule } from '../news/news.module';
import { TelegramPublisherModule } from '../telegram/telegram-publisher.module';
import { MarketDataModule } from '@libs/market-data';
import { MarketDataV3Module } from '../market-data-v3/market-data-v3.module';

@Module({
  imports: [CoreModule, NewsModule, MarketDataModule, MarketDataV3Module, TelegramPublisherModule],
  providers: [FeedRunnerService],
})
export class FeedsModule {}
