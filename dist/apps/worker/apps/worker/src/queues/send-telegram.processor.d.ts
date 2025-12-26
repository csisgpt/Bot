import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TelegramService } from '@libs/telegram';
import { Signal } from '@libs/signals';
export declare class SendTelegramProcessor extends WorkerHost {
    private readonly telegramService;
    constructor(telegramService: TelegramService);
    process(job: Job<Signal | {
        chatId: string;
        text: string;
        parseMode?: string;
    }>): Promise<void>;
}
