import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BinanceMarketDataProvider } from './providers/binance.provider';
import { BybitMarketDataProvider } from './providers/bybit.provider';
import { OkxMarketDataProvider } from './providers/okx.provider';
import { CoinbaseMarketDataProvider } from './providers/coinbase.provider';
import { KrakenMarketDataProvider } from './providers/kraken.provider';
import { KucoinMarketDataProvider } from './providers/kucoin.provider';
import { GateioMarketDataProvider } from './providers/gateio.provider';
import { MexcMarketDataProvider } from './providers/mexc.provider';
import { BitfinexMarketDataProvider } from './providers/bitfinex.provider';
import { BitstampMarketDataProvider } from './providers/bitstamp.provider';
import { MARKET_DATA_PROVIDERS, ProviderRegistryService } from './provider-registry.service';

@Module({
  imports: [ConfigModule],
  providers: [
    BinanceMarketDataProvider,
    BybitMarketDataProvider,
    OkxMarketDataProvider,
    CoinbaseMarketDataProvider,
    KrakenMarketDataProvider,
    KucoinMarketDataProvider,
    GateioMarketDataProvider,
    MexcMarketDataProvider,
    BitfinexMarketDataProvider,
    BitstampMarketDataProvider,
    {
      provide: MARKET_DATA_PROVIDERS,
      useFactory: (
        binance: BinanceMarketDataProvider,
        bybit: BybitMarketDataProvider,
        okx: OkxMarketDataProvider,
        coinbase: CoinbaseMarketDataProvider,
        kraken: KrakenMarketDataProvider,
        kucoin: KucoinMarketDataProvider,
        gateio: GateioMarketDataProvider,
        mexc: MexcMarketDataProvider,
        bitfinex: BitfinexMarketDataProvider,
        bitstamp: BitstampMarketDataProvider,
      ) => [
        binance,
        bybit,
        okx,
        coinbase,
        kraken,
        kucoin,
        gateio,
        mexc,
        bitfinex,
        bitstamp,
      ],
      inject: [
        BinanceMarketDataProvider,
        BybitMarketDataProvider,
        OkxMarketDataProvider,
        CoinbaseMarketDataProvider,
        KrakenMarketDataProvider,
        KucoinMarketDataProvider,
        GateioMarketDataProvider,
        MexcMarketDataProvider,
        BitfinexMarketDataProvider,
        BitstampMarketDataProvider,
      ],
    },
    ProviderRegistryService,
  ],
  exports: [ProviderRegistryService],
})
export class MarketDataProvidersModule {}
