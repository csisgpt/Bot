import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { CoreModule, createRedisConnection } from '@libs/core';
import { BinanceModule } from '@libs/binance';
import { SignalsModule } from '@libs/signals';
import { TelegramModule } from '@libs/telegram';
import { HealthController } from './health.controller';
import { SignalsCron } from './cron/signals.cron';
import { SendTelegramProcessor } from './queues/send-telegram.processor';
import { ConfigService } from '@nestjs/config';

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
    BullModule.registerQueue({ name: 'signals' }),
  ],
  controllers: [HealthController],
  providers: [SignalsCron, SendTelegramProcessor],
})
export class WorkerModule {}
