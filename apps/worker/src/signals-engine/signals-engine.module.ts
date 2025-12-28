import { Module } from '@nestjs/common';
import { CoreModule } from '@libs/core';
import { MarketDataModule } from '../market-data/market-data.module';
import { SignalsEngineService } from './signals-engine.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CoreModule, MarketDataModule, NotificationsModule],
  providers: [SignalsEngineService],
})
export class SignalsEngineModule {}
