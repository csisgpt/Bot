import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TelegramService } from '@libs/telegram';
import { PrismaService } from '@libs/core';
export declare class SendTelegramProcessor extends WorkerHost {
    private readonly telegramService;
    private readonly prismaService;
    constructor(telegramService: TelegramService, prismaService: PrismaService);
    process(job: Job<unknown>): Promise<void>;
    private handleDelivery;
}
