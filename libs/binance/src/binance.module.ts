import { Module } from '@nestjs/common';
import { BinanceClient } from './binance.client';
import { BinanceWsService } from './binance-ws.service';
import { MarketPriceService } from './market-price.service';
import { BinanceMarketDataProvider } from './binance-market-data.provider';
import { CoreModule } from '@libs/core';

@Module({
  imports: [CoreModule],
  providers: [BinanceClient, BinanceWsService, MarketPriceService, BinanceMarketDataProvider],
  exports: [BinanceClient, BinanceWsService, MarketPriceService, BinanceMarketDataProvider],
})
export class BinanceModule {}
