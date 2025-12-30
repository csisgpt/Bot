import { describe, expect, it, vi } from 'vitest';
import { NotificationOrchestratorService } from '../apps/worker/src/notifications/notification-orchestrator.service';
import { SignalsProcessor } from '../apps/worker/src/queues/signals.processor';

const baseChatConfig = {
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
};

const buildConfigService = (overrides: Record<string, unknown> = {}) => ({
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
      ...overrides,
    };
    return map[key] ?? fallback;
  },
});

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
        findMany: vi.fn().mockResolvedValue([baseChatConfig]),
      },
    } as never;

    const redisService = {
      get: vi.fn().mockResolvedValue(null),
      exists: vi.fn().mockResolvedValue(0),
      eval: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue('OK'),
      incr: vi.fn().mockResolvedValue(1),
      rpush: vi.fn(),
      ltrim: vi.fn(),
      expire: vi.fn(),
      mget: vi.fn().mockResolvedValue([]),
    } as never;

    const orchestrator = new NotificationOrchestratorService(
      buildConfigService(),
      prismaService,
      redisService,
      deliveryRepository,
      { formatNews: vi.fn(), formatArbitrage: vi.fn(), formatSignal: vi.fn() } as never,
      { publishSignal: vi.fn() } as never,
      queue,
    );

    await orchestrator.handleSignalCreated('sig-1');

    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'QUEUED' }),
    );
    expect(redisService.eval).toHaveBeenCalled();
    expect(redisService.set).toHaveBeenCalled();
  });

  it('buffers digest items once when duplicate delivery is detected', async () => {
    let callCount = 0;
    const createDelivery = vi.fn().mockImplementation(() => {
      callCount += 1;
      if (callCount === 1) return Promise.resolve({ id: 'delivery-2' });
      const error = new Error('duplicate');
      (error as any).code = 'P2002';
      return Promise.reject(error);
    });

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
          { ...baseChatConfig, digestEnabled: true, chatId: 'chat-2' },
        ]),
      },
    } as never;

    const redisService = {
      get: vi.fn().mockResolvedValue(null),
      exists: vi.fn().mockResolvedValue(0),
      eval: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue('OK'),
      incr: vi.fn().mockResolvedValue(1),
      rpush: vi.fn(),
      ltrim: vi.fn(),
      expire: vi.fn(),
      mget: vi.fn().mockResolvedValue([]),
    } as never;

    const orchestrator = new NotificationOrchestratorService(
      buildConfigService({ NOTIF_DIGEST_ENABLED_DEFAULT: true }),
      prismaService,
      redisService,
      deliveryRepository,
      { formatNews: vi.fn(), formatArbitrage: vi.fn(), formatSignal: vi.fn() } as never,
      { publishSignal: vi.fn() } as never,
      queue,
    );

    await orchestrator.handleSignalCreated('sig-2');
    await orchestrator.handleSignalCreated('sig-2');

    expect(redisService.rpush).toHaveBeenCalledTimes(1);
  });

  it('does not commit rate-limit or cooldown when skipped', async () => {
    const deliveryRepository = {
      findExisting: vi.fn().mockResolvedValue(null),
      createDelivery: vi.fn().mockResolvedValue({ id: 'skip-1' }),
      updateDeliveryStatus: vi.fn(),
    } as never;

    const queue = { add: vi.fn() } as never;
    const prismaService = {
      signal: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sig-3',
          assetType: 'CRYPTO',
          instrument: 'BTCUSDT',
          interval: '15m',
          strategy: 'ema_rsi',
          confidence: 90,
          source: 'BINANCE',
        }),
      },
      chatConfig: {
        findMany: vi.fn().mockResolvedValue([baseChatConfig]),
      },
    } as never;

    const redisService = {
      get: vi.fn().mockResolvedValue('12'),
      exists: vi.fn().mockResolvedValue(0),
      eval: vi.fn(),
      set: vi.fn(),
      incr: vi.fn().mockResolvedValue(1),
      rpush: vi.fn(),
      ltrim: vi.fn(),
      expire: vi.fn(),
      mget: vi.fn().mockResolvedValue([]),
    } as never;

    const orchestrator = new NotificationOrchestratorService(
      buildConfigService(),
      prismaService,
      redisService,
      deliveryRepository,
      { formatNews: vi.fn(), formatArbitrage: vi.fn(), formatSignal: vi.fn() } as never,
      { publishSignal: vi.fn() } as never,
      queue,
    );

    await orchestrator.handleSignalCreated('sig-3');

    expect(redisService.eval).not.toHaveBeenCalled();
    const nonStatusSets = redisService.set.mock.calls.filter(
      ([key]) => key !== 'notif:lastProcessedAt',
    );
    expect(nonStatusSets).toEqual([]);
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
