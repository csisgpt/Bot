import { ConfigService } from '@nestjs/config';
import { TelegramService } from '@libs/telegram';
export declare class AdminController {
    private readonly configService;
    private readonly telegramService;
    constructor(configService: ConfigService, telegramService: TelegramService);
    testTelegram(ownerUserIdHeader?: string, adminTokenHeader?: string): Promise<{
        ok: true;
    }>;
}
