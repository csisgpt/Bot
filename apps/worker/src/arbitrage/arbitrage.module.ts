import { Module } from '@nestjs/common';
import { CoreModule } from '@libs/core';
import { MarketDataModule } from '@libs/market-data';
import { ArbitrageScannerService } from './arbitrage-scanner.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CoreModule, MarketDataModule, NotificationsModule],
  providers: [ArbitrageScannerService],
  exports: [ArbitrageScannerService],
})
export class ArbitrageModule {}
