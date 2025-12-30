import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InstrumentRegistryService } from './instrument-registry.service';
import { ProviderRegistryService, MARKET_DATA_PROVIDERS } from './provider-registry.service';
import { BinanceMarketDataProvider } from './providers/binance.provider';
import { BybitMarketDataProvider } from './providers/bybit.provider';
import { OkxMarketDataProvider } from './providers/okx.provider';
import { KcexMarketDataProvider } from './providers/kcex.provider';
import { CoinbaseMarketDataProvider } from './providers/coinbase.provider';
import { KrakenMarketDataProvider } from './providers/kraken.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    InstrumentRegistryService,
    ProviderRegistryService,
    BinanceMarketDataProvider,
    BybitMarketDataProvider,
    OkxMarketDataProvider,
    KcexMarketDataProvider,
    CoinbaseMarketDataProvider,
    KrakenMarketDataProvider,
    {
      provide: MARKET_DATA_PROVIDERS,
      useFactory: (
        binance: BinanceMarketDataProvider,
        bybit: BybitMarketDataProvider,
        okx: OkxMarketDataProvider,
        kcex: KcexMarketDataProvider,
        coinbase: CoinbaseMarketDataProvider,
        kraken: KrakenMarketDataProvider,
      ) => [binance, bybit, okx, kcex, coinbase, kraken],
      inject: [
        BinanceMarketDataProvider,
        BybitMarketDataProvider,
        OkxMarketDataProvider,
        KcexMarketDataProvider,
        CoinbaseMarketDataProvider,
        KrakenMarketDataProvider,
      ],
    },
  ],
  exports: [InstrumentRegistryService, ProviderRegistryService, MARKET_DATA_PROVIDERS],
})
export class MarketDataModule {}
