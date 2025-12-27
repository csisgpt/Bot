import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CoreModule, createRedisConnection, SIGNALS_QUEUE_NAME } from '@libs/core';
import { TelegramModule } from '@libs/telegram';
import { AdminController } from './admin.controller';
import { HealthController } from './health.controller';
import { TradingViewWebhookController } from './webhooks/tradingview.controller';
import { RenderKeepAliveCron } from './render-keepalive.cron';
import { TelegramBotModule } from './telegram/telegram-bot.module';

@Module({
  imports: [
    CoreModule,
    TelegramModule,
    TelegramBotModule,
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
  controllers: [AdminController, HealthController, TradingViewWebhookController],
  providers: [RenderKeepAliveCron],
})
export class AppModule {}
