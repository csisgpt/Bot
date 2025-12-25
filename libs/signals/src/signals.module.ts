import { Module } from '@nestjs/common';
import { CoreModule } from '@libs/core';
import { BinanceModule } from '@libs/binance';
import { SignalsService } from './signals.service';
import { SignalDedupeService } from './signal-dedupe.service';
import { BinanceSpotCandleFeed } from './feeds/binance-spot-candle-feed';
import { FeedRegistry } from './feeds/feed.registry';
import { StrategyRegistry } from './strategies/strategy.registry';

@Module({
  imports: [CoreModule, BinanceModule],
  providers: [SignalsService, SignalDedupeService, BinanceSpotCandleFeed, FeedRegistry, StrategyRegistry],
  exports: [SignalsService, SignalDedupeService, FeedRegistry, StrategyRegistry],
})
export class SignalsModule {}
