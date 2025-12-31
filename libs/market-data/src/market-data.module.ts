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
import { KucoinMarketDataProvider } from './providers/kucoin.provider';
import { GateioMarketDataProvider } from './providers/gateio.provider';
import { MexcMarketDataProvider } from './providers/mexc.provider';
import { BitfinexMarketDataProvider } from './providers/bitfinex.provider';
import { BitstampMarketDataProvider } from './providers/bitstamp.provider';
import { TwelveDataMarketDataProvider } from './providers/twelvedata.provider';
import { NavasanMarketDataProvider } from './providers/navasan.provider';
import { BrsApiMarketDataProvider } from './providers/brsapi-market.provider';
import { BonbastMarketDataProvider } from './providers/bonbast.provider';

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
    KucoinMarketDataProvider,
    GateioMarketDataProvider,
    MexcMarketDataProvider,
    BitfinexMarketDataProvider,
    BitstampMarketDataProvider,
    TwelveDataMarketDataProvider,
    NavasanMarketDataProvider,
    BrsApiMarketDataProvider,
    BonbastMarketDataProvider,
    {
      provide: MARKET_DATA_PROVIDERS,
      useFactory: (
        binance: BinanceMarketDataProvider,
        bybit: BybitMarketDataProvider,
        okx: OkxMarketDataProvider,
        kcex: KcexMarketDataProvider,
        coinbase: CoinbaseMarketDataProvider,
        kraken: KrakenMarketDataProvider,
        kucoin: KucoinMarketDataProvider,
        gateio: GateioMarketDataProvider,
        mexc: MexcMarketDataProvider,
        bitfinex: BitfinexMarketDataProvider,
        bitstamp: BitstampMarketDataProvider,
        twelvedata: TwelveDataMarketDataProvider,
        navasan: NavasanMarketDataProvider,
        brsapiMarket: BrsApiMarketDataProvider,
        bonbast: BonbastMarketDataProvider,
      ) => [
        binance,
        bybit,
        okx,
        kcex,
        coinbase,
        kraken,
        kucoin,
        gateio,
        mexc,
        bitfinex,
        bitstamp,
        twelvedata,
        navasan,
        brsapiMarket,
        bonbast,
      ],
      inject: [
        BinanceMarketDataProvider,
        BybitMarketDataProvider,
        OkxMarketDataProvider,
        KcexMarketDataProvider,
        CoinbaseMarketDataProvider,
        KrakenMarketDataProvider,
        KucoinMarketDataProvider,
        GateioMarketDataProvider,
        MexcMarketDataProvider,
        BitfinexMarketDataProvider,
        BitstampMarketDataProvider,
        TwelveDataMarketDataProvider,
        NavasanMarketDataProvider,
        BrsApiMarketDataProvider,
        BonbastMarketDataProvider,
      ],
    },
  ],
  exports: [InstrumentRegistryService, ProviderRegistryService, MARKET_DATA_PROVIDERS],
})
export class MarketDataModule {}
