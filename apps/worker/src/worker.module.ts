import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import {
  CoreModule, createRedisConnection, SIGNALS_QUEUE_NAME,
  MARKET_DATA_QUEUE_NAME,
} from '@libs/core';
import { BinanceModule } from '@libs/binance';
import { SignalsModule } from '@libs/signals';
import { TelegramModule } from '@libs/telegram';
import { HealthController } from './health.controller';
import { MarketDataModule } from './market-data/market-data.module';
import { SignalsCron } from './cron/signals.cron';
import { PriceTickerCron } from './cron/price-ticker.cron';
import { ConfigService } from '@nestjs/config';
import { SignalsProcessor } from './queues/signals.processor';
import { TradingViewEmailIngestService } from './tradingview/tradingview-email.service';
import { AlertsCron } from './cron/alerts.cron';
import { DigestCron } from './cron/digest.cron';
import { SignalsEngineModule } from './signals-engine/signals-engine.module';
import { MarketDataV3Module } from './market-data-v3/market-data-v3.module';
import { ArbitrageModule } from './arbitrage/arbitrage.module';
import { NewsModule } from './news/news.module';
import { MarketDataProcessor } from './queues/market-data.processor';
import { NotificationsModule } from './notifications/notifications.module';
import { MarketDataModule as WorkerMarketDataModule } from './market-data/market-data.module';
import { MarketDataModule as ProvidersMarketDataModule } from '@libs/market-data';
import { FeedsModule } from './feeds/feeds.module';

@Module({
  imports: [
    CoreModule,
    BinanceModule,
    SignalsModule,
    TelegramModule,
    WorkerMarketDataModule,
    ProvidersMarketDataModule,
    SignalsEngineModule,
    MarketDataV3Module,
    ArbitrageModule,
    NewsModule,
    NotificationsModule,
    FeedsModule,
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [CoreModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: createRedisConnection(configService),
      }),
    }),
    BullModule.registerQueue({ name: SIGNALS_QUEUE_NAME }),
    BullModule.registerQueue({ name: MARKET_DATA_QUEUE_NAME }),],
  controllers: [HealthController],
  providers: [
    SignalsCron,
    PriceTickerCron,
    AlertsCron,
    DigestCron,
    SignalsProcessor,
    MarketDataProcessor,
    TradingViewEmailIngestService,
  ],
})
export class WorkerModule { }
