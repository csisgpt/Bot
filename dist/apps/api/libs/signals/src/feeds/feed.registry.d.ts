import { ConfigService } from '@nestjs/config';
import { AssetType } from '../types';
import { CandleFeed } from './candle-feed';
import { BinanceSpotCandleFeed } from './binance-spot-candle-feed';
export declare class FeedRegistry {
    private readonly configService;
    private readonly binanceSpotCandleFeed;
    constructor(configService: ConfigService, binanceSpotCandleFeed: BinanceSpotCandleFeed);
    getFeed(assetType: AssetType): CandleFeed;
}
