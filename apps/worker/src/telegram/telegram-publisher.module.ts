import { Module } from '@nestjs/common';
import { TelegramModule } from '@libs/telegram';
import { TelegramPublisherService } from './telegram-publisher.service';

@Module({
  imports: [TelegramModule],
  providers: [TelegramPublisherService],
  exports: [TelegramPublisherService],
})
export class TelegramPublisherModule {}
