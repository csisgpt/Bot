import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { CoreModule, MARKET_DATA_QUEUE_NAME } from '@libs/core';
import { MarketDataModule } from '@libs/market-data';
import { MarketDataModule as LegacyMarketDataModule } from '../market-data/market-data.module';
import { MarketDataIngestService } from './market-data-ingest.service';
import { ActiveSymbolsService } from './active-symbols.service';

@Module({
  imports: [
    CoreModule,
    MarketDataModule,
    LegacyMarketDataModule,
    BullModule.registerQueue({ name: MARKET_DATA_QUEUE_NAME }),
  ],
  providers: [MarketDataIngestService, ActiveSymbolsService],
  exports: [ActiveSymbolsService],
})
export class MarketDataV3Module {}
