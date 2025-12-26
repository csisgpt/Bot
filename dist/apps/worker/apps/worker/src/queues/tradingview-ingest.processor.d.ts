import { WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { FeedRegistry, SignalDeliveryService, SignalDedupeService, SignalsService, RoutingService } from '@libs/signals';
interface TradingViewIngestJob {
    receivedAt: string;
    ip?: string;
    headersSubset?: Record<string, string | string[] | undefined>;
    payloadRaw: unknown;
}
export declare class TradingViewIngestProcessor extends WorkerHost {
    private readonly configService;
    private readonly signalsService;
    private readonly signalDedupeService;
    private readonly feedRegistry;
    private readonly routingService;
    private readonly signalDeliveryService;
    private readonly signalsQueue;
    private readonly logger;
    constructor(configService: ConfigService, signalsService: SignalsService, signalDedupeService: SignalDedupeService, feedRegistry: FeedRegistry, routingService: RoutingService, signalDeliveryService: SignalDeliveryService, signalsQueue: Queue);
    process(job: Job<TradingViewIngestJob>): Promise<void>;
    private getDefaults;
    private resolvePriceFallback;
}
export {};
