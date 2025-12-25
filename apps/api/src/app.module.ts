import { Module } from '@nestjs/common';
import { CoreModule } from '@libs/core';
import { TelegramModule } from '@libs/telegram';
import { AdminController } from './admin.controller';
import { HealthController } from './health.controller';

@Module({
  imports: [CoreModule, TelegramModule],
  controllers: [AdminController, HealthController],
})
export class AppModule {}
