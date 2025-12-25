import { Controller, Headers, HttpException, HttpStatus, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from '@libs/telegram';
import { SeedService } from '@libs/signals';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly configService: ConfigService,
    private readonly telegramService: TelegramService,
    private readonly seedService: SeedService,
  ) {}

  @Post('test-telegram')
  async testTelegram(
    @Headers('x-owner-user-id') ownerUserIdHeader?: string,
    @Headers('x-admin-token') adminTokenHeader?: string,
  ): Promise<{ ok: true }> {
    const ownerUserId =
      this.configService.get<string>('TELEGRAM_OWNER_USER_ID') ??
      this.configService.get<string>('OWNER_USER_ID');
    const adminToken = this.configService.get<string>('ADMIN_TEST_TOKEN');

    const ownerMatch = Boolean(ownerUserId && ownerUserIdHeader === ownerUserId);
    const tokenMatch = Boolean(adminToken && adminTokenHeader === adminToken);

    if (!ownerMatch && !tokenMatch) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const message = `✅ Telegram test from API (${new Date().toISOString()})`;
    await this.telegramService.sendTestMessage(message);

    return { ok: true };
  }

  @Post('seed')
  async seed(): Promise<{ ok: true; details: Record<string, number> }> {
    const details = await this.seedService.seed();
    return { ok: true, details };
  }
}
