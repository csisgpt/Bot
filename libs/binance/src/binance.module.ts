import { Module } from '@nestjs/common';
import { BinanceClient } from './binance.client';
import { BinanceWsService } from './binance-ws.service';
import { MarketPriceService } from './market-price.service';
import { CoreModule } from '@libs/core';

@Module({
  imports: [CoreModule],
  providers: [BinanceClient, BinanceWsService, MarketPriceService],
  exports: [BinanceClient, BinanceWsService, MarketPriceService],
})
export class BinanceModule {}
