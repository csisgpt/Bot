import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { MarketPriceService } from '@libs/binance';
export declare class PriceTickerCron implements OnModuleInit, OnModuleDestroy {
    private readonly configService;
    private readonly marketPriceService;
    private readonly signalsQueue;
    private readonly logger;
    private timer?;
    constructor(configService: ConfigService, marketPriceService: MarketPriceService, signalsQueue: Queue);
    onModuleInit(): void;
    onModuleDestroy(): void;
    private handleTick;
    private parseList;
}
