import { BinanceClient } from '@libs/binance';
import { CandleFeed, CandleFeedRequest } from './candle-feed';
import { Candle } from '../types';
export declare class BinanceSpotCandleFeed implements CandleFeed {
    private readonly binanceClient;
    constructor(binanceClient: BinanceClient);
    getCandles(request: CandleFeedRequest): Promise<Candle[]>;
}
