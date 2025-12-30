import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CoreModule, SIGNALS_QUEUE_NAME } from '@libs/core';
import { TelegramModule } from '@libs/telegram';
import { NotificationOrchestratorService } from './notification-orchestrator.service';
import { NotificationDeliveryRepository } from './delivery/notification-delivery.repository';
import { MessageFormatterService } from './formatting/message-formatter.service';
import { TelegramPublisherModule } from '../telegram/telegram-publisher.module';
import { SignalsFeedPublisherService } from './signals-feed-publisher.service';

@Module({
  imports: [
    CoreModule,
    TelegramModule,
    TelegramPublisherModule,
    BullModule.registerQueue({ name: SIGNALS_QUEUE_NAME }),
  ],
  providers: [
    NotificationOrchestratorService,
    NotificationDeliveryRepository,
    MessageFormatterService,
    SignalsFeedPublisherService,
  ],
  exports: [NotificationOrchestratorService],
})
export class NotificationsModule {}
