import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BinanceMarketDataProvider } from './providers/binance.provider';
import { BybitMarketDataProvider } from './providers/bybit.provider';
import { OkxMarketDataProvider } from './providers/okx.provider';
import { MARKET_DATA_PROVIDERS, ProviderRegistryService } from './provider-registry.service';

@Module({
  imports: [ConfigModule],
  providers: [
    BinanceMarketDataProvider,
    BybitMarketDataProvider,
    OkxMarketDataProvider,
    {
      provide: MARKET_DATA_PROVIDERS,
      useFactory: (
        binance: BinanceMarketDataProvider,
        bybit: BybitMarketDataProvider,
        okx: OkxMarketDataProvider,
      ) => [binance, bybit, okx],
      inject: [BinanceMarketDataProvider, BybitMarketDataProvider, OkxMarketDataProvider],
    },
    ProviderRegistryService,
  ],
  exports: [ProviderRegistryService],
})
export class MarketDataProvidersModule {}
