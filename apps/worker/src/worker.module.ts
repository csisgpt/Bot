import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { CoreModule, createRedisConnection, SIGNALS_QUEUE_NAME } from '@libs/core';
import { BinanceModule } from '@libs/binance';
import { SignalsModule } from '@libs/signals';
import { TelegramModule } from '@libs/telegram';
import { HealthController } from './health.controller';
import { SignalsCron } from './cron/signals.cron';
import { PriceTickerCron } from './cron/price-ticker.cron';
import { ConfigService } from '@nestjs/config';
import { SignalsProcessor } from './queues/signals.processor';
import { TradingViewEmailIngestService } from './tradingview/tradingview-email.service';

@Module({
  imports: [
    CoreModule,
    BinanceModule,
    SignalsModule,
    TelegramModule,
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [CoreModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: createRedisConnection(configService),
      }),
    }),
    BullModule.registerQueue({ name: SIGNALS_QUEUE_NAME }),
  ],
  controllers: [HealthController],
  providers: [
    SignalsCron,
    PriceTickerCron,
    SignalsProcessor,
    TradingViewEmailIngestService,
  ],
})
export class WorkerModule {}
