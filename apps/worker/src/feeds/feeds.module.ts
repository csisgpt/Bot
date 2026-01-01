import { Module } from '@nestjs/common';
import { MarketDataV3Module } from '../market-data-v3/market-data-v3.module';
import { TelegramPublisherModule } from '../telegram/telegram-publisher.module';
import { ArbitrageModule } from '../arbitrage/arbitrage.module';
import { MarketDataModule } from '../market-data/market-data.module';
import { MarketDataProviderModule } from '../market-data/providers/market-data-provider.module';
import { FeedRunnerService } from './feed-runner.service';
import { FeedConfigService } from './feed-config.service';
import { FeedsSchedulerService } from './feeds.scheduler';

@Module({
  imports: [
    MarketDataV3Module,
    TelegramPublisherModule,
    ArbitrageModule,
    MarketDataModule,
    MarketDataProviderModule,
  ],
  providers: [FeedRunnerService, FeedConfigService, FeedsSchedulerService],
  exports: [FeedRunnerService, FeedConfigService],
})
export class FeedsModule {}