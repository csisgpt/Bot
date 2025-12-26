import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
export declare class TradingViewEmailIngestService implements OnModuleInit, OnModuleDestroy {
    private readonly configService;
    private readonly signalsQueue;
    private readonly logger;
    private timer?;
    private running;
    constructor(configService: ConfigService, signalsQueue: Queue);
    onModuleInit(): void;
    onModuleDestroy(): void;
    private poll;
    private pollOnce;
    private extractPayloads;
    private safeParseJson;
}
