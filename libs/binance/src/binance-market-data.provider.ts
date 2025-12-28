import { Injectable } from '@nestjs/common';
import { BinanceClient } from './binance.client';
import { MarketDataKline, MarketDataProvider } from './market-data.provider';

const normalizeInstrument = (symbol: string): string =>
  symbol
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

@Injectable()
export class BinanceMarketDataProvider implements MarketDataProvider {
  readonly source = 'BINANCE';

  constructor(private readonly binanceClient: BinanceClient) {}

  async getLastPrice(
    symbol: string,
  ): Promise<{ instrument: string; price: number; ts: number } | null> {
    const instrument = normalizeInstrument(symbol);
    const snapshot = await this.binanceClient.getLastPrice(instrument);
    if (!Number.isFinite(snapshot.price)) {
      return null;
    }
    return { instrument, price: snapshot.price, ts: snapshot.ts };
  }

  async getKlines(
    symbol: string,
    timeframe: string,
    limit: number,
    endTime?: number,
  ): Promise<MarketDataKline[]> {
    const instrument = normalizeInstrument(symbol);
    const klines = await this.binanceClient.getKlines(instrument, timeframe, limit, endTime);
    return klines.map((kline) => ({
      openTime: kline.openTime,
      open: kline.open,
      high: kline.high,
      low: kline.low,
      close: kline.close,
      volume: kline.volume,
      closeTime: kline.closeTime,
    }));
  }
}
