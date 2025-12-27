import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ChatConfig } from '@prisma/client';
import {
  atr,
  AssetType,
  Candle,
  FeedRegistry,
  Signal,
  SignalDedupeService,
  SignalsService,
  StrategyRegistry,
} from '@libs/signals';
import { PrismaService, SIGNALS_QUEUE_NAME } from '@libs/core';

interface MonitoringEntry {
  assetType: AssetType;
  instrument: string;
  timeframe: string;
  chatConfigs: ChatConfig[];
}

@Injectable()
export class SignalsCron {
  private readonly logger = new Logger(SignalsCron.name);

  constructor(
    private readonly signalsService: SignalsService,
    private readonly configService: ConfigService,
    private readonly signalDedupeService: SignalDedupeService,
    private readonly feedRegistry: FeedRegistry,
    private readonly strategyRegistry: StrategyRegistry,
    private readonly prismaService: PrismaService,
    @InjectQueue(SIGNALS_QUEUE_NAME) private readonly signalsQueue: Queue,
  ) {}

  @Cron('*/1 * * * *')
  async handleCron(): Promise<void> {
    const monitoringEnabled = this.configService.get<boolean>('MONITORING_ENABLED', true);
    if (!monitoringEnabled) {
      this.logger.debug('Monitoring disabled (MONITORING_ENABLED=false).');
      return;
    }

    const assetsEnabled = this.parseAssetList(
      this.configService.get<string>('ASSETS_ENABLED', 'GOLD,CRYPTO'),
    );

    const defaultTimeframes = this.getDefaultTimeframes();
    const limit = this.configService.get<number>('BINANCE_KLINES_LIMIT', 200);

    const strategiesEnabled = this.parseList(
      this.configService.get<string>('STRATEGIES_ENABLED', 'ema_rsi'),
    );
    const strategies = this.strategyRegistry.getByIds(strategiesEnabled);

    const riskLevelsEnabled = this.configService.get<boolean>('ENABLE_RISK_LEVELS', true);

    const chatConfigs = await this.prismaService.chatConfig.findMany({
      where: { isEnabled: true },
    });

    const plan = this.buildMonitoringPlan(chatConfigs, assetsEnabled, defaultTimeframes);
    if (plan.length === 0) {
      this.logger.warn('No monitoring entries found for signals cron.');
      return;
    }

    // cache candles by (assetType, instrument, timeframe) to avoid refetch when multiple chats share same plan
    const candleCache = new Map<string, Candle[]>();

    for (const entry of plan) {
      const { assetType, instrument, timeframe, chatConfigs: entryChats } = entry;

      const cacheKey = `${assetType}:${instrument}:${timeframe}`;
      let candles = candleCache.get(cacheKey);

      if (!candles) {
        try {
          const feed = this.feedRegistry.getFeed(assetType);
          candles = await feed.getCandles({ instrument, interval: timeframe, limit });
          candleCache.set(cacheKey, candles);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Failed to fetch candles ${assetType}/${instrument}/${timeframe}: ${message}`);
          continue;
        }
      }

      if (!candles || candles.length < 2) continue;

      for (const strategy of strategies) {
        const rawSignal = strategy.evaluate({
          candles,
          instrument,
          interval: timeframe,
          assetType,
        });

        if (!rawSignal) continue;

        const signal = riskLevelsEnabled ? this.attachRiskLevels(rawSignal, candles) : rawSignal;

        const allowed = await this.signalDedupeService.isAllowed(signal);
        if (!allowed) continue;

        const storedSignal = await this.signalsService.storeSignal(signal);
        await this.dispatchSignalToChats(storedSignal, entryChats);
      }
    }
  }

  // -------------------------
  // Helpers
  // -------------------------

  private parseList(value?: string): string[] {
    return (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private parseAssetList(value?: string): AssetType[] {
    return this.parseList(value)
      .map((asset) => asset.toUpperCase())
      .filter((asset): asset is AssetType => asset === 'GOLD' || asset === 'CRYPTO');
  }

  /**
   * Backward-compat alias:
   * Some branches might call parseAssetsList(...) instead of parseAssetList(...)
   */
  private parseAssetsList(value?: string): AssetType[] {
    return this.parseAssetList(value);
  }

  private getDefaultTimeframes(): string[] {
    const timeframes = this.parseList(this.configService.get<string>('DEFAULT_TIMEFRAMES', ''));
    if (timeframes.length > 0) return timeframes;

    // fallback to legacy single interval if DEFAULT_TIMEFRAMES is not set
    const fallback = this.configService.get<string>('BINANCE_INTERVAL', '15m');
    return [fallback];
  }

  private getDefaultInstruments(assetType: AssetType): string[] {
    if (assetType === 'GOLD') {
      const instruments = this.parseList(
        this.configService.get<string>('GOLD_INSTRUMENTS', 'XAUTUSDT'),
      );
      return instruments.length > 0 ? instruments : ['XAUTUSDT'];
    }

    const cryptoInstruments = this.parseList(this.configService.get<string>('CRYPTO_INSTRUMENTS', ''));
    if (cryptoInstruments.length > 0) return cryptoInstruments;

    // legacy fallback
    const legacy = this.parseList(this.configService.get<string>('BINANCE_SYMBOLS', 'BTCUSDT'));
    return legacy.length > 0 ? legacy : ['BTCUSDT'];
  }

  /**
   * Backward-compat alias:
   * Some branches might still call getInstrumentsForAsset(...)
   */
  private getInstrumentsForAsset(assetType: AssetType): string[] {
    return this.getDefaultInstruments(assetType);
  }

  private buildMonitoringPlan(
    chatConfigs: ChatConfig[],
    assetsEnabled: AssetType[],
    defaultTimeframes: string[],
  ): MonitoringEntry[] {
    const plan = new Map<string, MonitoringEntry>();

    const goldSet = new Set(this.getDefaultInstruments('GOLD').map((x) => x.toUpperCase()));
    const cryptoSet = new Set(this.getDefaultInstruments('CRYPTO').map((x) => x.toUpperCase()));

    // If no chat config exists yet, fall back to env-based plan and send to fallback destinations
    if (chatConfigs.length === 0) {
      for (const assetType of assetsEnabled) {
        const instruments = this.getDefaultInstruments(assetType);
        for (const instrument of instruments) {
          for (const timeframe of defaultTimeframes) {
            const key = `${assetType}:${instrument}:${timeframe}`;
            plan.set(key, { assetType, instrument, timeframe, chatConfigs: [] });
          }
        }
      }
      return Array.from(plan.values());
    }

    for (const chatConfig of chatConfigs) {
      const assets =
        chatConfig.assetsEnabled?.length > 0
          ? this.parseAssetList(chatConfig.assetsEnabled.join(','))
          : assetsEnabled;

      const timeframes =
        chatConfig.timeframes?.length > 0 ? chatConfig.timeframes : defaultTimeframes;

      const watchlist = (chatConfig.watchlist ?? []).map((x) => x.toUpperCase()).filter(Boolean);

      for (const assetType of assets) {
        let instruments: string[] = [];

        if (watchlist.length > 0) {
          if (assetType === 'GOLD') {
            // allow known gold + XAU-like symbols
            instruments = watchlist.filter((item) => goldSet.has(item) || item.includes('XAU'));
          } else {
            // allow known crypto + anything not gold-ish
            instruments = watchlist.filter(
              (item) => cryptoSet.has(item) || (!goldSet.has(item) && !item.includes('XAU')),
            );
          }
        } else {
          instruments = this.getDefaultInstruments(assetType);
        }

        if (instruments.length === 0) continue;

        for (const instrument of instruments) {
          for (const timeframe of timeframes) {
            const key = `${assetType}:${instrument}:${timeframe}`;
            const existing = plan.get(key);

            if (existing) {
              existing.chatConfigs.push(chatConfig);
            } else {
              plan.set(key, { assetType, instrument, timeframe, chatConfigs: [chatConfig] });
            }
          }
        }
      }
    }

    return Array.from(plan.values());
  }

  private async dispatchSignalToChats(signal: Signal, chatConfigs: ChatConfig[]): Promise<void> {
    const now = new Date();
    const fallbackChannelId = this.configService.get<string>('TELEGRAM_SIGNAL_CHANNEL_ID', '');
    const fallbackGroupId = this.configService.get<string>('TELEGRAM_SIGNAL_GROUP_ID', '');

    const destinations = new Set<string>();

    // If no ChatConfig matched, fallback to env channel/group
    if (chatConfigs.length === 0) {
      if (fallbackChannelId) destinations.add(fallbackChannelId);
      if (fallbackGroupId) destinations.add(fallbackGroupId);
    } else {
      for (const chatConfig of chatConfigs) {
        if (!this.isSignalAllowedForChat(signal, chatConfig, now)) continue;

        if (chatConfig.chatType === 'group') {
          if (chatConfig.sendToGroup) destinations.add(chatConfig.chatId);
          if (chatConfig.sendToChannel && fallbackChannelId) destinations.add(fallbackChannelId);
          continue;
        }

        if (chatConfig.chatType === 'channel') {
          if (chatConfig.sendToChannel) destinations.add(chatConfig.chatId);
          continue;
        }

        // private chat
        destinations.add(chatConfig.chatId);
      }
    }

    if (destinations.size === 0) {
      this.logger.warn(
        `No Telegram destinations for signal ${signal.instrument} ${signal.interval} ${signal.side}.`,
      );
      return;
    }

    for (const chatId of destinations) {
      await this.signalsQueue.add(
        'sendTelegramSignal',
        { chatId, signal },
        {
          removeOnComplete: true,
          removeOnFail: { count: 50 },
        },
      );
    }
  }

  private isSignalAllowedForChat(signal: Signal, chatConfig: ChatConfig, now: Date): boolean {
    if (signal.confidence < chatConfig.minConfidence) return false;

    // mute logic
    if (chatConfig.mutedUntil && now < chatConfig.mutedUntil) {
      if (chatConfig.mutedInstruments.length === 0) return false;
      if (chatConfig.mutedInstruments.includes(signal.instrument)) return false;
    }

    // quiet hours (UTC)
    if (chatConfig.quietHoursEnabled) {
      const inQuiet = this.isInQuietHours(now, chatConfig.quietHoursStart, chatConfig.quietHoursEnd);
      if (inQuiet) return false;
    }

    return true;
  }

  private isInQuietHours(now: Date, start?: string | null, end?: string | null): boolean {
    if (!start || !end) return false;

    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    if ([startH, startM, endH, endM].some((v) => Number.isNaN(v))) return false;

    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // if equal, treat as disabled
    if (startMinutes === endMinutes) return false;

    // normal range
    if (startMinutes < endMinutes) {
      return minutes >= startMinutes && minutes < endMinutes;
    }

    // overnight range
    return minutes >= startMinutes || minutes < endMinutes;
  }

  /**
   * Adds SL/TP levels based on ATR, but ONLY if:
   * - ATR is valid
   * - signal.price is a valid number (non-null)
   */
  private attachRiskLevels(signal: Signal, candles: Candle[]): Signal {
    const period = this.configService.get<number>('ATR_PERIOD', 14);

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const closes = candles.map((c) => c.close);

    const atrValues = atr(highs, lows, closes, period);
    const lastAtr = atrValues[candles.length - 1];

    if (!lastAtr || Number.isNaN(lastAtr)) return signal;

    const price = signal.price ?? null;
    if (price == null || !Number.isFinite(price)) {
      return { ...signal, levels: undefined };
    }

    const slMultiplier = this.configService.get<number>('SL_ATR_MULTIPLIER', 1.5);
    const tp1Multiplier = this.configService.get<number>('TP1_ATR_MULTIPLIER', 2);
    const tp2Multiplier = this.configService.get<number>('TP2_ATR_MULTIPLIER', 3);

    if (signal.side === 'BUY') {
      const sl = price - lastAtr * slMultiplier;
      const tp1 = price + lastAtr * tp1Multiplier;
      const tp2 = price + lastAtr * tp2Multiplier;

      return {
        ...signal,
        levels: { entry: price, sl, tp1, tp2 },
        sl,
        tp1,
        tp2,
      };
    }

    if (signal.side === 'SELL') {
      const sl = price + lastAtr * slMultiplier;
      const tp1 = price - lastAtr * tp1Multiplier;
      const tp2 = price - lastAtr * tp2Multiplier;

      return {
        ...signal,
        levels: { entry: price, sl, tp1, tp2 },
        sl,
        tp1,
        tp2,
      };
    }

    return { ...signal, levels: undefined };
  }
}
