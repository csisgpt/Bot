import { ConfigService } from '@nestjs/config';
import { Signal } from '@libs/signals';
import type { ParseMode } from 'telegraf/types';
export declare class TelegramService {
    private readonly logger;
    private readonly bot;
    private readonly channelId;
    private readonly groupId;
    private readonly parseMode;
    private readonly disableWebPreview;
    constructor(configService: ConfigService);
    sendTestMessage(message: string): Promise<void>;
    sendSignal(signal: Signal): Promise<void>;
    sendMessage(chatId: string, message: string, parseMode?: ParseMode): Promise<void>;
    private sendMessageToDestinations;
}
