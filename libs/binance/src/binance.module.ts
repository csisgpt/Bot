import { Module } from '@nestjs/common';
import { BinanceClient } from './binance.client';
import { CoreModule } from '@libs/core';

@Module({
  imports: [CoreModule],
  providers: [BinanceClient],
  exports: [BinanceClient],
})
export class BinanceModule {}
