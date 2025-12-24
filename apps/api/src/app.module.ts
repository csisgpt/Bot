import { Module } from '@nestjs/common';
import { CoreModule } from '@libs/core';
import { HealthController } from './health.controller';

@Module({
  imports: [CoreModule],
  controllers: [HealthController],
})
export class AppModule {}
