import { Body, Controller, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramBotService } from './telegram-bot.service';

@Controller('telegram')
export class TelegramBotController {
  constructor(
    private readonly configService: ConfigService,
    private readonly telegramBotService: TelegramBotService,
  ) {}

  @Post('webhook')
  async handleWebhook(
    @Body() body: unknown,
    @Headers('x-telegram-bot-api-secret-token') apiSecret?: string,
    @Headers('x-telegram-webhook-secret') legacySecret?: string,
  ): Promise<{ ok: true }> {
    const secret = this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET', '');
    const provided = apiSecret ?? legacySecret;
    if (!secret || provided !== secret) {
      throw new UnauthorizedException();
    }

    await this.telegramBotService.handleUpdate(body);
    return { ok: true };
  }
}
