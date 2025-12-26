import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { JobRunService } from '@libs/core';
import { MarketPriceService } from '@libs/binance';
export declare class PriceTickerCron implements OnModuleInit, OnModuleDestroy {
    private readonly configService;
    private readonly marketPriceService;
    private readonly jobRunService;
    private readonly signalsQueue;
    private readonly logger;
    private timer?;
    constructor(configService: ConfigService, marketPriceService: MarketPriceService, jobRunService: JobRunService, signalsQueue: Queue);
    onModuleInit(): void;
    onModuleDestroy(): void;
    private handleTick;
    private parseList;
}
