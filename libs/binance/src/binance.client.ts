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
    this.http = axios.create({
      baseURL: configService.get<string>('BINANCE_BASE_URL', 'https://api.binance.com'),
      timeout: 10000,
    });
  }

  async getKlines(symbol: string, interval: string, limit = 200): Promise<Kline[]> {
    const response = await this.http.get('/api/v3/klines', {
      params: {
        symbol,
        interval,
        limit,
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
}
