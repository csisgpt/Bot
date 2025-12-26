import { ConfigService } from '@nestjs/config';
import { TelegramService } from '@libs/telegram';
import { SeedService } from '@libs/signals';
export declare class AdminController {
    private readonly configService;
    private readonly telegramService;
    private readonly seedService;
    constructor(configService: ConfigService, telegramService: TelegramService, seedService: SeedService);
    testTelegram(ownerUserIdHeader?: string, adminTokenHeader?: string): Promise<{
        ok: true;
    }>;
    seed(): Promise<{
        ok: true;
        details: Record<string, number>;
    }>;
}
