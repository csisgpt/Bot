import { ConfigService } from '@nestjs/config';
export interface Kline {
    openTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    closeTime: number;
}
export declare class BinanceClient {
    private readonly http;
    constructor(configService: ConfigService);
    getKlines(symbol: string, interval: string, limit?: number): Promise<Kline[]>;
    getLastPrice(symbol: string): Promise<{
        symbol: string;
        price: number;
        ts: number;
    }>;
}
