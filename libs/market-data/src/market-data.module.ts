import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InstrumentRegistryService } from './instrument-registry.service';
import { ProviderRegistryService, MARKET_DATA_PROVIDERS } from './provider-registry.service';
import { BinanceMarketDataProvider } from './providers/binance.provider';
import { BybitMarketDataProvider } from './providers/bybit.provider';
import { OkxMarketDataProvider } from './providers/okx.provider';
import { KcexMarketDataProvider } from './providers/kcex.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    InstrumentRegistryService,
    ProviderRegistryService,
    BinanceMarketDataProvider,
    BybitMarketDataProvider,
    OkxMarketDataProvider,
    KcexMarketDataProvider,
    {
      provide: MARKET_DATA_PROVIDERS,
      useFactory: (
        binance: BinanceMarketDataProvider,
        bybit: BybitMarketDataProvider,
        okx: OkxMarketDataProvider,
        kcex: KcexMarketDataProvider,
      ) => [binance, bybit, okx, kcex],
      inject: [
        BinanceMarketDataProvider,
        BybitMarketDataProvider,
        OkxMarketDataProvider,
        KcexMarketDataProvider,
      ],
    },
  ],
  exports: [InstrumentRegistryService, ProviderRegistryService, MARKET_DATA_PROVIDERS],
})
export class MarketDataModule {}
