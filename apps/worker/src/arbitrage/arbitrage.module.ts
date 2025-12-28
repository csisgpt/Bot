import { Module } from '@nestjs/common';
import { CoreModule } from '@libs/core';
import { MarketDataModule } from '@libs/market-data';
import { ArbitrageScannerService } from './arbitrage-scanner.service';

@Module({
  imports: [CoreModule, MarketDataModule],
  providers: [ArbitrageScannerService],
  exports: [ArbitrageScannerService],
})
export class ArbitrageModule {}
