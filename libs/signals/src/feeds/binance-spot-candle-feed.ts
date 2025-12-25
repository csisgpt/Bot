import { Injectable } from '@nestjs/common';
import { BinanceClient } from '@libs/binance';
import { CandleFeed, CandleFeedRequest } from './candle-feed';
import { Candle } from '../types';

@Injectable()
export class BinanceSpotCandleFeed implements CandleFeed {
  constructor(private readonly binanceClient: BinanceClient) {}

  async getCandles(request: CandleFeedRequest): Promise<Candle[]> {
    return this.binanceClient.getKlines(request.instrument, request.interval, request.limit);
  }
}
