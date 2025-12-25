import {
  Body,
  Controller,
  Headers,
  NotFoundException,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { SIGNALS_QUEUE_NAME } from '@libs/core';

@Controller('webhooks')
export class TradingViewWebhookController {
  constructor(
    private readonly configService: ConfigService,
    @InjectQueue(SIGNALS_QUEUE_NAME) private readonly signalsQueue: Queue,
  ) {}

  @Post('tradingview')
  async handleTradingViewWebhook(
    @Req() request: Request,
    @Body() body: unknown,
    @Headers('x-tv-token') headerToken?: string,
    @Query('token') queryToken?: string,
  ): Promise<{ ok: true }> {
    const enabled = this.configService.get<boolean>('TRADINGVIEW_WEBHOOK_ENABLED', false);
    if (!enabled) {
      throw new NotFoundException();
    }

    const secret = this.configService.get<string>('TRADINGVIEW_WEBHOOK_SECRET', '');
    const bodyToken = this.extractBodyToken(body);
    const token = headerToken ?? queryToken ?? bodyToken;
    if (!secret || token !== secret) {
      throw new UnauthorizedException();
    }

    await this.signalsQueue.add(
      'ingestTradingViewAlert',
      {
        receivedAt: new Date().toISOString(),
        ip: request.ip,
        headersSubset: {
          'user-agent': request.headers['user-agent'],
          'content-type': request.headers['content-type'],
        },
        payloadRaw: body,
      },
      {
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    return { ok: true };
  }

  private extractBodyToken(body: unknown): string | undefined {
    if (!body) {
      return undefined;
    }

    if (typeof body === 'object') {
      return (body as { token?: string }).token;
    }

    if (typeof body === 'string') {
      const trimmed = body.trim();
      if (!trimmed) {
        return undefined;
      }
      try {
        const parsed = JSON.parse(trimmed) as { token?: string };
        return parsed.token;
      } catch {
        return undefined;
      }
    }

    return undefined;
  }
}
