import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { Queue } from 'bullmq';
import { SIGNALS_QUEUE_NAME } from '@libs/core';

@Injectable()
export class TradingViewEmailIngestService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TradingViewEmailIngestService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue(SIGNALS_QUEUE_NAME) private readonly signalsQueue: Queue,
  ) {}

  onModuleInit(): void {
    const enabled = this.configService.get<boolean>('TRADINGVIEW_EMAIL_ENABLED', false);
    if (!enabled) {
      return;
    }

    const pollSeconds = this.configService.get<number>('TRADINGVIEW_EMAIL_POLL_SECONDS', 30);
    const pollMs = Math.max(5, pollSeconds) * 1000;
    this.timer = setInterval(() => {
      void this.poll();
    }, pollMs);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async poll(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      await this.pollOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`TradingView email ingest failed: ${message}`);
    } finally {
      this.running = false;
    }
  }

  private async pollOnce(): Promise<void> {
    const enabled = this.configService.get<boolean>('TRADINGVIEW_EMAIL_ENABLED', false);
    if (!enabled) {
      return;
    }

    const host = this.configService.get<string>('TRADINGVIEW_IMAP_HOST');
    const user = this.configService.get<string>('TRADINGVIEW_IMAP_USER');
    const pass = this.configService.get<string>('TRADINGVIEW_IMAP_PASS');
    if (!host || !user || !pass) {
      this.logger.warn('TradingView email ingest is enabled but IMAP credentials are missing.');
      return;
    }

    const client = new ImapFlow({
      host,
      port: this.configService.get<number>('TRADINGVIEW_IMAP_PORT', 993),
      secure: this.configService.get<boolean>('TRADINGVIEW_IMAP_SECURE', true),
      auth: {
        user,
        pass,
      },
    });

    await client.connect();
    try {
      const mailbox = this.configService.get<string>('TRADINGVIEW_EMAIL_FOLDER', 'INBOX');
      await client.mailboxOpen(mailbox);
      const unseen = await client.search({ seen: false });
      if (unseen.length === 0) {
        return;
      }

      for await (const message of client.fetch(unseen, { source: true, envelope: true })) {
        const parsed = await simpleParser(message.source);
        const body = parsed.text ?? parsed.html ?? '';
        const payloads = this.extractPayloads(body);

        for (const payload of payloads) {
          await this.signalsQueue.add(
            'ingestTradingViewAlert',
            {
              receivedAt: new Date().toISOString(),
              ip: 'email',
              headersSubset: {
                subject: parsed.subject ?? '',
              },
              payloadRaw: payload,
            },
            { removeOnComplete: true, removeOnFail: { count: 50 } },
          );
        }

        await client.messageFlagsAdd(message.uid, ['\\Seen']);
      }
    } finally {
      await client.logout();
    }
  }

  private extractPayloads(body: string): Array<Record<string, unknown>> {
    const trimmed = body.trim();
    if (!trimmed) {
      return [];
    }

    const payloads: Array<Record<string, unknown>> = [];
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      const parsed = this.safeParseJson(trimmed);
      if (parsed) {
        payloads.push(parsed);
        return payloads;
      }
    }

    const regex = /---TV_JSON---([\s\S]*?)---\/TV_JSON---/g;
    let match = regex.exec(body);
    while (match) {
      const candidate = match[1].trim();
      const parsed = this.safeParseJson(candidate);
      if (parsed) {
        payloads.push(parsed);
      }
      match = regex.exec(body);
    }

    return payloads;
  }

  private safeParseJson(value: string): Record<string, unknown> | undefined {
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return parsed;
    } catch {
      return undefined;
    }
  }
}
