import { Module } from '@nestjs/common';
import { CoreModule } from '@libs/core';
import { TelegramService } from './telegram.service';

@Module({
  imports: [CoreModule],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
