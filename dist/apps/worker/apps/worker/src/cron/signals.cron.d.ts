import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { FeedRegistry, SignalDeliveryService, SignalDedupeService, SignalsService, StrategyRegistry, RoutingService } from '@libs/signals';
import { JobRunService } from '@libs/core';
export declare class SignalsCron {
    private readonly signalsService;
    private readonly configService;
    private readonly signalDedupeService;
    private readonly feedRegistry;
    private readonly strategyRegistry;
    private readonly routingService;
    private readonly signalDeliveryService;
    private readonly jobRunService;
    private readonly signalsQueue;
    private readonly logger;
    constructor(signalsService: SignalsService, configService: ConfigService, signalDedupeService: SignalDedupeService, feedRegistry: FeedRegistry, strategyRegistry: StrategyRegistry, routingService: RoutingService, signalDeliveryService: SignalDeliveryService, jobRunService: JobRunService, signalsQueue: Queue);
    handleCron(): Promise<void>;
    private parseList;
    private getInstrumentsForAsset;
    private attachRiskLevels;
}
