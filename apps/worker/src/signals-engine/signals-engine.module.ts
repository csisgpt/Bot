import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CoreModule, SIGNALS_QUEUE_NAME } from '@libs/core';
import { MarketDataModule } from '../market-data/market-data.module';
import { SignalsEngineService } from './signals-engine.service';

@Module({
  imports: [CoreModule, MarketDataModule, BullModule.registerQueue({ name: SIGNALS_QUEUE_NAME })],
  providers: [SignalsEngineService],
})
export class SignalsEngineModule {}
