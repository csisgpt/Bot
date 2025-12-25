import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssetType } from '../types';
import { CandleFeed } from './candle-feed';
import { BinanceSpotCandleFeed } from './binance-spot-candle-feed';

type PriceProvider = 'BINANCE_SPOT';

@Injectable()
export class FeedRegistry {
  constructor(
    private readonly configService: ConfigService,
    private readonly binanceSpotCandleFeed: BinanceSpotCandleFeed,
  ) {}

  getFeed(assetType: AssetType): CandleFeed {
    const provider =
      assetType === 'GOLD'
        ? (this.configService.get<string>('PRICE_PROVIDER_GOLD', 'BINANCE_SPOT') as PriceProvider)
        : (this.configService.get<string>(
            'PRICE_PROVIDER_CRYPTO',
            'BINANCE_SPOT',
          ) as PriceProvider);

    switch (provider) {
      case 'BINANCE_SPOT':
        return this.binanceSpotCandleFeed;
      default:
        throw new Error(`Unsupported price provider ${provider} for ${assetType}`);
    }
  }
}
