import { WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job, Queue } from 'bullmq';
import { FeedRegistry, SignalDedupeService, SignalsService } from '@libs/signals';
import { TelegramService } from '@libs/telegram';
export declare class SignalsProcessor extends WorkerHost {
    private readonly configService;
    private readonly signalsService;
    private readonly signalDedupeService;
    private readonly feedRegistry;
    private readonly telegramService;
    private readonly signalsQueue;
    private readonly logger;
    constructor(configService: ConfigService, signalsService: SignalsService, signalDedupeService: SignalDedupeService, feedRegistry: FeedRegistry, telegramService: TelegramService, signalsQueue: Queue);
    process(job: Job<any>): Promise<void>;
    private handleTradingViewIngest;
    private handleSendTelegramSignal;
    private handleSendTelegramText;
    private getDefaults;
    private resolvePriceFallback;
    private getNumber;
    private withTimeout;
}
