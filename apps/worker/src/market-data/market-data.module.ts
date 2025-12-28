import { Module } from '@nestjs/common';
import { CoreModule } from '@libs/core';
import { BinanceModule } from '@libs/binance';
import { MonitoringPlanService } from './monitoring-plan.service';
import { CandleIngestService } from './candle-ingest.service';
import { CandleAggregateService } from './candle-aggregate.service';

@Module({
  imports: [CoreModule, BinanceModule],
  providers: [MonitoringPlanService, CandleIngestService, CandleAggregateService],
  exports: [MonitoringPlanService],
})
export class MarketDataModule {}
