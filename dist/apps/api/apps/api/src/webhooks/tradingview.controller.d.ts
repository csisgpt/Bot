import { Queue } from 'bullmq';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
export declare class TradingViewWebhookController {
    private readonly configService;
    private readonly signalsQueue;
    constructor(configService: ConfigService, signalsQueue: Queue);
    handleTradingViewWebhook(request: Request, body: unknown, headerToken?: string, queryToken?: string): Promise<{
        ok: true;
    }>;
    private extractBodyToken;
}
