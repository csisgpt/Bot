import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { CoreModule, createRedisConnection, SIGNALS_QUEUE_NAME } from '@libs/core';
import { TelegramModule } from '@libs/telegram';
import { AdminController } from './admin.controller';
import { HealthController } from './health.controller';
import { TradingViewWebhookController } from './webhooks/tradingview.controller';

@Module({
  imports: [
    CoreModule,
    TelegramModule,
    BullModule.forRootAsync({
      imports: [CoreModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: createRedisConnection(configService),
      }),
    }),
    BullModule.registerQueue({ name: SIGNALS_QUEUE_NAME }),
  ],
  controllers: [AdminController, HealthController, TradingViewWebhookController],
})
export class AppModule {}
