import { describe, expect, it, vi } from 'vitest';
import { NotificationOrchestratorService } from '../apps/worker/src/notifications/notification-orchestrator.service';
import { SignalsProcessor } from '../apps/worker/src/queues/signals.processor';

describe('notification delivery lifecycle', () => {
  it('creates QUEUED delivery before enqueue', async () => {
    const createDelivery = vi.fn().mockResolvedValue({ id: 'delivery-1' });
    const deliveryRepository = {
      findExisting: vi.fn().mockResolvedValue(null),
      createDelivery,
      updateDeliveryStatus: vi.fn(),
    } as never;

    const queue = { add: vi.fn() } as never;
    const prismaService = {
      signal: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sig-1',
          assetType: 'CRYPTO',
          instrument: 'BTCUSDT',
          interval: '15m',
          strategy: 'ema_rsi',
          confidence: 90,
          source: 'BINANCE',
        }),
      },
      chatConfig: {
        findMany: vi.fn().mockResolvedValue([
          {
            chatId: 'chat-1',
            chatType: 'group',
            sendToGroup: true,
            sendToChannel: false,
            isEnabled: true,
            watchlist: [],
            enabledProviders: [],
            enabledFeatures: { signals: true, news: true, arbitrage: true },
            quietHoursEnabled: false,
            quietHoursStart: '23:00',
            quietHoursEnd: '08:00',
            maxNotifsPerHour: 12,
            cooldownSignalsSec: 600,
            cooldownNewsSec: 1800,
            cooldownArbSec: 300,
            minConfidence: 60,
            digestEnabled: false,
            digestTimes: [],
            assetsEnabled: [],
            timeframes: [],
            mutedUntil: null,
            mutedInstruments: [],
            mode: 'NORMAL',
          },
        ]),
      },
    } as never;

    const redisService = {
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn(),
      set: vi.fn().mockResolvedValue('OK'),
      rpush: vi.fn(),
      get: vi.fn(),
      mget: vi.fn().mockResolvedValue([]),
    } as never;

    const configService = {
      get: (key: string, fallback?: unknown) => {
        const map: Record<string, unknown> = {
          NOTIFICATION_ORCHESTRATOR_ENABLED: true,
          NOTIF_MODE_DEFAULT: 'NORMAL',
          NOTIF_MAX_PER_HOUR_DEFAULT: 12,
          NOTIF_QUIET_HOURS_DEFAULT_ENABLED: true,
          NOTIF_QUIET_HOURS_DEFAULT_START: '23:00',
          NOTIF_QUIET_HOURS_DEFAULT_END: '08:00',
          NOTIF_COOLDOWN_SIGNALS_DEFAULT: 600,
          NOTIF_COOLDOWN_NEWS_DEFAULT: 1800,
          NOTIF_COOLDOWN_ARB_DEFAULT: 300,
          NOTIF_MIN_CONFIDENCE_DEFAULT: 60,
          NOTIF_DIGEST_ENABLED_DEFAULT: false,
          NOTIF_DIGEST_TIMES_DEFAULT: [],
          SIGNALS_TELEGRAM_JOB_ATTEMPTS: 5,
          SIGNALS_TELEGRAM_JOB_BACKOFF_DELAY_MS: 2000,
          SIGNALS_TELEGRAM_JOB_PRIORITY: 1,
          APP_TIMEZONE: 'Europe/Berlin',
        };
        return map[key] ?? fallback;
      },
    } as never;

    const orchestrator = new NotificationOrchestratorService(
      configService,
      prismaService,
      redisService,
      deliveryRepository,
      { formatNews: vi.fn(), formatArbitrage: vi.fn(), formatSignal: vi.fn() } as never,
      queue,
    );

    await orchestrator.handleSignalCreated('sig-1');

    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'QUEUED' }),
    );
  });

  it('buffers digest items and marks delivery as BUFFERED', async () => {
    const createDelivery = vi.fn().mockResolvedValue({ id: 'delivery-2' });
    const deliveryRepository = {
      findExisting: vi.fn().mockResolvedValue(null),
      createDelivery,
      updateDeliveryStatus: vi.fn(),
    } as never;

    const queue = { add: vi.fn() } as never;
    const prismaService = {
      signal: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sig-2',
          assetType: 'CRYPTO',
          instrument: 'ETHUSDT',
          interval: '15m',
          strategy: 'ema_rsi',
          confidence: 70,
          source: 'BINANCE',
        }),
      },
      chatConfig: {
        findMany: vi.fn().mockResolvedValue([
          {
            chatId: 'chat-2',
            chatType: 'group',
            sendToGroup: true,
            sendToChannel: false,
            isEnabled: true,
            watchlist: [],
            enabledProviders: [],
            enabledFeatures: { signals: true, news: true, arbitrage: true },
            quietHoursEnabled: false,
            quietHoursStart: '23:00',
            quietHoursEnd: '08:00',
            maxNotifsPerHour: 12,
            cooldownSignalsSec: 600,
            cooldownNewsSec: 1800,
            cooldownArbSec: 300,
            minConfidence: 60,
            digestEnabled: true,
            digestTimes: ['09:00'],
            assetsEnabled: [],
            timeframes: [],
            mutedUntil: null,
            mutedInstruments: [],
            mode: 'NORMAL',
          },
        ]),
      },
    } as never;

    const redisService = {
      incr: vi.fn().mockResolvedValue(1),
      expire: vi.fn(),
      set: vi.fn().mockResolvedValue('OK'),
      rpush: vi.fn(),
      get: vi.fn(),
      mget: vi.fn().mockResolvedValue([]),
    } as never;

    const configService = {
      get: (key: string, fallback?: unknown) => {
        const map: Record<string, unknown> = {
          NOTIFICATION_ORCHESTRATOR_ENABLED: true,
          NOTIF_MODE_DEFAULT: 'NORMAL',
          NOTIF_MAX_PER_HOUR_DEFAULT: 12,
          NOTIF_QUIET_HOURS_DEFAULT_ENABLED: true,
          NOTIF_QUIET_HOURS_DEFAULT_START: '23:00',
          NOTIF_QUIET_HOURS_DEFAULT_END: '08:00',
          NOTIF_COOLDOWN_SIGNALS_DEFAULT: 600,
          NOTIF_COOLDOWN_NEWS_DEFAULT: 1800,
          NOTIF_COOLDOWN_ARB_DEFAULT: 300,
          NOTIF_MIN_CONFIDENCE_DEFAULT: 60,
          NOTIF_DIGEST_ENABLED_DEFAULT: false,
          NOTIF_DIGEST_TIMES_DEFAULT: ['09:00'],
          SIGNALS_TELEGRAM_JOB_ATTEMPTS: 5,
          SIGNALS_TELEGRAM_JOB_BACKOFF_DELAY_MS: 2000,
          SIGNALS_TELEGRAM_JOB_PRIORITY: 1,
          APP_TIMEZONE: 'Europe/Berlin',
        };
        return map[key] ?? fallback;
      },
    } as never;

    const orchestrator = new NotificationOrchestratorService(
      configService,
      prismaService,
      redisService,
      deliveryRepository,
      { formatNews: vi.fn(), formatArbitrage: vi.fn(), formatSignal: vi.fn() } as never,
      queue,
    );

    await orchestrator.handleSignalCreated('sig-2');

    expect(redisService.rpush).toHaveBeenCalled();
    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'BUFFERED' }),
    );
  });

  it('updates delivery to SENT with message_id after send', async () => {
    const prismaService = {
      notificationDelivery: {
        update: vi.fn(),
      },
      signalDeliveryLog: {
        create: vi.fn(),
      },
    } as never;

    const telegramService = {
      sendMessage: vi.fn().mockResolvedValue(42),
    } as never;

    const processor = new SignalsProcessor(
      { get: () => false } as never,
      {} as never,
      {} as never,
      {} as never,
      telegramService,
      prismaService,
      { handleSignalCreated: vi.fn() } as never,
    );

    await processor.process({
      name: 'sendTelegramText',
      data: {
        chatId: 'chat-1',
        text: 'سلام',
        parseMode: 'HTML',
        notificationDeliveryId: 'delivery-1',
      },
    } as never);

    expect(prismaService.notificationDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: { status: 'SENT', providerMessageId: '42' },
    });
  });
});
