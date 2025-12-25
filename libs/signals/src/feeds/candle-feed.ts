import { Candle } from '../types';

export interface CandleFeedRequest {
  instrument: string;
  interval: string;
  limit: number;
}

export interface CandleFeed {
  getCandles(request: CandleFeedRequest): Promise<Candle[]>;
}
