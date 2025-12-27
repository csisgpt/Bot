import { Module } from '@nestjs/common';
import { CoreModule } from '@libs/core';
import { TelegramBotController } from './telegram-bot.controller';
import { TelegramBotService } from './telegram-bot.service';

@Module({
  imports: [CoreModule],
  controllers: [TelegramBotController],
  providers: [TelegramBotService],
})
export class TelegramBotModule {}
