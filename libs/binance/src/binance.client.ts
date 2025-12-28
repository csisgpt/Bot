import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

@Injectable()
export class BinanceClient {
  private readonly http: AxiosInstance;

  constructor(configService: ConfigService) {
    const baseURL =
      configService.get<string>('BINANCE_REST_BASE_URL') ??
      configService.get<string>('BINANCE_BASE_URL', 'https://api.binance.com');
    const timeout =
      configService.get<number>('BINANCE_REST_TIMEOUT_MS') ??
      configService.get<number>('BINANCE_REQUEST_TIMEOUT_MS', 10000);
    this.http = axios.create({
      baseURL,
      timeout,
    });
  }

  async getKlines(
    symbol: string,
    interval: string,
    limit = 200,
    endTime?: number,
  ): Promise<Kline[]> {
    const response = await this.http.get('/api/v3/klines', {
      params: {
        symbol,
        interval,
        limit,
        endTime,
      },
    });

    return (response.data as Array<string[]>).map((item) => ({
      openTime: Number(item[0]),
      open: Number(item[1]),
      high: Number(item[2]),
      low: Number(item[3]),
      close: Number(item[4]),
      volume: Number(item[5]),
      closeTime: Number(item[6]),
    }));
  }

  async getLastPrice(symbol: string): Promise<{ symbol: string; price: number; ts: number }> {
    const response = await this.http.get('/api/v3/ticker/price', {
      params: { symbol },
    });
    const payload = response.data as { symbol: string; price: string };
    return {
      symbol: payload.symbol,
      price: Number(payload.price),
      ts: Date.now(),
    };
  }
}
