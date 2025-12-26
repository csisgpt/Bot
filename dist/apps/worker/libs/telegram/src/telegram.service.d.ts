import { ConfigService } from '@nestjs/config';
import { Signal } from '@libs/signals';
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
    sendMessage(chatId: string, message: string, parseMode?: string): Promise<number | undefined>;
    private sendMessageToDestinations;
}
