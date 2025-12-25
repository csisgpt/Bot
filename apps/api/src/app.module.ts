import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { CoreModule, createRedisConnection, SIGNALS_QUEUE_NAME } from '@libs/core';
import { TelegramModule } from '@libs/telegram';
import { SignalsModule } from '@libs/signals';
import { AdminController } from './admin.controller';
import { HealthController } from './health.controller';
import { TradingViewWebhookController } from './webhooks/tradingview.controller';
import { SignalsController } from './signals.controller';
import { DeliveriesController } from './deliveries.controller';

@Module({
  imports: [
    CoreModule,
    TelegramModule,
    SignalsModule,
    BullModule.forRootAsync({
      imports: [CoreModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: createRedisConnection(configService),
      }),
    }),
    BullModule.registerQueue({ name: SIGNALS_QUEUE_NAME }),
  ],
  controllers: [
    AdminController,
    HealthController,
    TradingViewWebhookController,
    SignalsController,
    DeliveriesController,
  ],
})
export class AppModule {}
