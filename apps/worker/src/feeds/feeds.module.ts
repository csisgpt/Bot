import { Module } from '@nestjs/common';
import { CoreModule } from '@libs/core';
import { FeedRunnerService } from './feed-runner.service';
import { NewsModule } from '../news/news.module';
import { MarketDataProvidersModule } from '../providers/market-data/market-data-providers.module';
import { TelegramPublisherModule } from '../telegram/telegram-publisher.module';

@Module({
  imports: [CoreModule, NewsModule, MarketDataProvidersModule, TelegramPublisherModule],
  providers: [FeedRunnerService],
})
export class FeedsModule {}
