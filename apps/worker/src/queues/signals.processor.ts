import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { PrismaService, SIGNALS_QUEUE_CONCURRENCY, SIGNALS_QUEUE_NAME } from '@libs/core';
import {
  FeedRegistry,
  Signal,
  SignalDedupeService,
  SignalsService,
  mapTradingViewPayloadToSignal,
  parseTradingViewPayload,
} from '@libs/signals';
import { TelegramService, telegramTextJobSchema } from '@libs/telegram';
import { NotificationOrchestratorService } from '../notifications/notification-orchestrator.service';

interface TradingViewIngestJob {
  receivedAt: string;
  ip?: string;
  headersSubset?: Record<string, string | string[] | undefined>;
  payloadRaw: unknown;
}

@Injectable()
@Processor(SIGNALS_QUEUE_NAME, { concurrency: SIGNALS_QUEUE_CONCURRENCY })
export class SignalsProcessor extends WorkerHost {
  private readonly logger = new Logger(SignalsProcessor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly signalsService: SignalsService,
    private readonly signalDedupeService: SignalDedupeService,
    private readonly feedRegistry: FeedRegistry,
    private readonly telegramService: TelegramService,
    private readonly prismaService: PrismaService,
    private readonly notificationOrchestrator: NotificationOrchestratorService,
  ) {
    super();
  }

  async process(job: Job<any>): Promise<void> {
    switch (job.name) {
      case 'ingestTradingViewAlert':
        await this.handleTradingViewIngest(job as Job<TradingViewIngestJob>);
        return;

      case 'sendTelegramSignal':
        await this.handleSendTelegramSignal(job as Job<{ chatId: string; signal: Signal }>);
        return;

      case 'sendTelegramText':
        await this.handleSendTelegramText(job as Job<{ chatId: string; text: string; parseMode?: string }>);
        return;

      default:
        this.logger.warn(`Unknown job name "${job.name}" (id=${job.id ?? 'unknown'})`);
        return;
    }
  }

  private async handleTradingViewIngest(job: Job<TradingViewIngestJob>): Promise<void> {
    const startedAt = Date.now();

    const { payloadRaw } = job.data;
    const { payload, parseError } = parseTradingViewPayload(payloadRaw);

    const instrument = (payload.instrument ?? payload.symbol ?? 'unknown') as string;
    const interval = (payload.interval ?? payload.timeframe ?? 'unknown') as string;
    const strategy = (payload.strategy ?? 'unknown') as string;

    try {
      if (parseError) {
        this.logger.warn(
          `TradingView payload parse error for job ${job.id ?? 'unknown'}: ${parseError}`,
        );
      }

      const defaults = this.getDefaults();

      // ✅ برای "لحظه‌ای" شدن: اول سیگنال رو بساز و enqueue کن، بعد سراغ کارهای کند برو
      // (اگر اصرار داری price هم بیاد، پایین‌تر async حلش می‌کنیم)
      const signal = mapTradingViewPayloadToSignal(payloadRaw, defaults, undefined);

      // اگر source برای TradingView درست set نمیشه، این خط کمک می‌کنه:
      (signal as any).source = (signal as any).source ?? 'TRADINGVIEW';

      // ✅ اگر می‌خوای "همه‌ی آلرت‌های TradingView" رد بشن، اینجا می‌تونی bypass کنی
      const sendAllTv = this.configService.get<string>('TRADINGVIEW_SEND_ALL', 'true') === 'true';
      const source = (signal as any).source ?? 'BINANCE';

      if (!sendAllTv || source !== 'TRADINGVIEW') {
        const shouldProcess = await this.signalDedupeService.isAllowed(signal);
        if (!shouldProcess) {
          this.logger.warn(
            `Dedupe BLOCKED (${signal.instrument} ${signal.interval} ${signal.side}) strategy=${signal.strategy}`,
          );
          return;
        }
      }

      const storedSignal = await this.signalsService.storeSignal(signal);
      await this.notificationOrchestrator.handleSignalCreated(storedSignal.id);

      // ✅ اگر price نیومده بود، تلاش کن سریع fallback بگیری (ولی جلوی ارسال رو نگیر)
      if (signal.price === null) {
        const priceFallbackTimeoutMs = this.getNumber('TRADINGVIEW_PRICE_FALLBACK_TIMEOUT_MS', 500);
        void this.withTimeout(
          this.resolvePriceFallback(payload, defaults),
          priceFallbackTimeoutMs,
          undefined,
        ).catch((e) =>
          this.logger.warn(`Failed to resolve TradingView price fallback: ${e?.message ?? e}`),
        );
      }

      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs > 1000) {
        this.logger.warn(
          `TradingView ingest slow job ${job.id ?? 'unknown'} (${instrument} ${interval} ${strategy}) took ${elapsedMs}ms`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `TradingView ingest failed for job ${job.id ?? 'unknown'} (${instrument} ${interval} ${strategy}): ${message}`,
      );
      throw error;
    }
  }

  private async handleSendTelegramSignal(
    job: Job<{ chatId: string; signal: Signal; notificationDeliveryId?: string }>,
  ): Promise<void> {
    try {
      const { chatId, signal, notificationDeliveryId } = job.data;
      const messageId = await this.telegramService.sendSignalToChat(signal, chatId);
      if (notificationDeliveryId) {
        await this.prismaService.notificationDelivery.update({
          where: { id: notificationDeliveryId },
          data: { status: 'SENT', providerMessageId: String(messageId) },
        });
      }
      await this.prismaService.signalDeliveryLog.create({
        data: {
          signalId: signal.id ?? 'unknown',
          chatId,
          messageId: String(messageId),
          status: 'SENT',
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const data = job.data;
      this.logger.error(
        `sendTelegramSignal failed job ${job.id ?? 'unknown'} (${data.signal.instrument} ${data.signal.interval} ${data.signal.side}): ${message}`,
      );
      if (data.notificationDeliveryId) {
        await this.prismaService.notificationDelivery.update({
          where: { id: data.notificationDeliveryId },
          data: { status: 'FAILED', reason: message },
        });
      }
      await this.prismaService.signalDeliveryLog.create({
        data: {
          signalId: data.signal.id ?? 'unknown',
          chatId: data.chatId,
          messageId: 'unknown',
          status: 'FAILED',
          error: message,
        },
      });
      // ✅ خیلی مهم: throw تا attempts/backoff عمل کنه
      throw err;
    }
  }

  private async handleSendTelegramText(
    job: Job<{ chatId: string; text: string; parseMode?: string }>,
  ): Promise<void> {
    const payload = telegramTextJobSchema.parse(job.data);
    try {
      await this.telegramService.sendMessage(String(payload.chatId), payload.text, payload.parseMode);
      if (payload.notificationDeliveryId) {
        await this.prismaService.notificationDelivery.update({
          where: { id: payload.notificationDeliveryId },
          data: { status: 'SENT' },
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`sendTelegramText failed job ${job.id ?? 'unknown'}: ${message}`);
      if (payload.notificationDeliveryId) {
        await this.prismaService.notificationDelivery.update({
          where: { id: payload.notificationDeliveryId },
          data: { status: 'FAILED', reason: message },
        });
      }
      throw err;
    }
  }

  private getDefaults(): {
    assetType: Signal['assetType'];
    instrument: string;
    interval: string;
    strategy: string;
  } {
    const defaultInterval = this.configService.get<string>(
      'TRADINGVIEW_DEFAULT_INTERVAL',
      this.configService.get<string>('BINANCE_INTERVAL', '15m'),
    );

    return {
      assetType: this.configService.get<Signal['assetType']>(
        'TRADINGVIEW_DEFAULT_ASSET_TYPE',
        'GOLD',
      ),
      instrument: this.configService.get<string>(
        'TRADINGVIEW_DEFAULT_INSTRUMENT',
        'XAUTUSDT',
      ),
      interval: defaultInterval,
      strategy: this.configService.get<string>(
        'TRADINGVIEW_DEFAULT_STRATEGY',
        'tradingview',
      ),
    };
  }

  private async resolvePriceFallback(
    payload: Record<string, unknown>,
    defaults: { assetType: Signal['assetType']; instrument: string; interval: string },
  ): Promise<number | undefined> {
    const priceValue = payload.price;
    if (priceValue !== undefined && priceValue !== null && `${priceValue}`.trim() !== '') {
      return undefined;
    }

    const assetType = (payload.assetType ?? defaults.assetType) as Signal['assetType'];
    const instrument = (payload.instrument ?? payload.symbol ?? defaults.instrument) as string;
    const interval = (payload.interval ?? payload.timeframe ?? defaults.interval) as string;

    const feed = this.feedRegistry.getFeed(assetType);
    const candles = await feed.getCandles({ instrument, interval, limit: 1 });
    if (candles.length > 0) return candles[candles.length - 1].close;

    return undefined;
  }


  private getNumber(key: string, fallback: number): number {
    const raw = this.configService.get<string | number | undefined>(key);
    if (raw === undefined || raw === null || raw === '') return fallback;
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

    return Promise.race([
      promise,
      new Promise<T>((resolve) => {
        const t = setTimeout(() => {
          clearTimeout(t);
          resolve(fallback);
        }, timeoutMs);
      }),
    ]);
  }
}
