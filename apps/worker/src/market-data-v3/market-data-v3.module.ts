import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CoreModule, MARKET_DATA_QUEUE_NAME } from '@libs/core';
import { MarketDataModule } from '@libs/market-data';
import { MarketDataIngestService } from './market-data-ingest.service';

@Module({
  imports: [
    CoreModule,
    MarketDataModule,
    BullModule.registerQueue({ name: MARKET_DATA_QUEUE_NAME }),
  ],
  providers: [MarketDataIngestService],
})
export class MarketDataV3Module {}
