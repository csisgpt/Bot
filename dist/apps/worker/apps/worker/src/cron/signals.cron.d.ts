import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { FeedRegistry, SignalDedupeService, SignalsService, StrategyRegistry } from '@libs/signals';
export declare class SignalsCron {
    private readonly signalsService;
    private readonly configService;
    private readonly signalDedupeService;
    private readonly feedRegistry;
    private readonly strategyRegistry;
    private readonly signalsQueue;
    private readonly logger;
    constructor(signalsService: SignalsService, configService: ConfigService, signalDedupeService: SignalDedupeService, feedRegistry: FeedRegistry, strategyRegistry: StrategyRegistry, signalsQueue: Queue);
    handleCron(): Promise<void>;
    private parseList;
    private getInstrumentsForAsset;
    private attachRiskLevels;
}
