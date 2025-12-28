import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, RedisService } from '@libs/core';
import { MonitoringPlanService } from '../market-data/monitoring-plan.service';
import { NotificationOrchestratorService } from '../notifications/notification-orchestrator.service';

const SOURCE = 'BINANCE';
const SIGNAL_KIND = 'ENGINE';
const STRATEGY_THRESHOLD_PERCENT = 0.2;

type SkipReason =
  | 'INSUFFICIENT_DATA'
  | 'STALE_CANDLES'
  | 'CANDLE_GAP'
  | 'NO_NEW_CANDLE'
  | 'COOLDOWN'
  | 'NO_SIGNAL'
  | 'DUPLICATE'
  | 'INVALID_TIMEFRAME'
  | 'INVALID_PREVIOUS_CLOSE'
  | 'ERROR';

interface EnginePair {
  instrument: string;
  timeframe: string;
}

interface EngineResult {
  status: 'produced' | 'skipped';
  reason?: SkipReason;
}

@Injectable()
export class SignalsEngineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SignalsEngineService.name);
  private intervalHandle?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly monitoringPlanService: MonitoringPlanService,
    private readonly configService: ConfigService,
    private readonly notificationOrchestrator: NotificationOrchestratorService,
  ) {}

  onModuleInit(): void {
    const enabled = this.configService.get<boolean>('SIGNAL_ENGINE_ENABLED', true);
    if (!enabled) {
      this.logger.log('Signals engine disabled (SIGNAL_ENGINE_ENABLED=false).');
      return;
    }

    const intervalSeconds = this.configService.get<number>('SIGNAL_ENGINE_INTERVAL_SECONDS', 30);
    this.intervalHandle = setInterval(() => {
      void this.runEngine();
    }, intervalSeconds * 1000);

    void this.runEngine();
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
  }

  private async runEngine(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Signals engine run skipped because a previous run is still active.');
      return;
    }

    this.isRunning = true;
    const summary = {
      processed: 0,
      produced: 0,
      skipped: new Map<SkipReason, number>(),
    };

    try {
      const plan = await this.monitoringPlanService.buildPlan();
      const targetTimeframes = new Set(this.getDefaultSignalTimeframes());
      const activeTimeframes = plan.activeTimeframes.filter((tf) => targetTimeframes.has(tf));

      if (plan.activeSymbols.length === 0 || activeTimeframes.length === 0) {
        this.logger.warn('Signals engine has no active symbols/timeframes to process.');
        return;
      }

      const pairs: EnginePair[] = [];
      for (const instrument of plan.activeSymbols) {
        for (const timeframe of activeTimeframes) {
          pairs.push({ instrument, timeframe });
        }
      }

      const concurrency = this.configService.get<number>('SIGNAL_ENGINE_CONCURRENCY', 5);

      await this.runWithConcurrency(pairs, concurrency, async (pair) => {
        const result = await this.processPair(pair);
        summary.processed += 1;
        if (result.status === 'produced') {
          summary.produced += 1;
          return;
        }
        if (result.reason) {
          summary.skipped.set(result.reason, (summary.skipped.get(result.reason) ?? 0) + 1);
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Signals engine run failed: ${message}`);
    } finally {
      const skippedSummary = Array.from(summary.skipped.entries())
        .map(([reason, count]) => `${reason}=${count}`)
        .join(', ');

      this.logger.log(
        `Signals engine run complete: processed=${summary.processed} produced=${summary.produced} skipped={${skippedSummary}}`,
      );
      this.isRunning = false;
    }
  }

  private async processPair(pair: EnginePair): Promise<EngineResult> {
    const { instrument, timeframe } = pair;
    try {
      const strategy = this.configService.get<string>('SIGNAL_STRATEGY_NAME', 'MVP_V1');
      const minCandles = this.configService.get<number>('MIN_CANDLES', 50);
      const cooldownSeconds = this.configService.get<number>('SIGNAL_COOLDOWN_SECONDS', 600);

      const timeframeMs = this.parseTimeframeToMs(timeframe);
      if (!timeframeMs) {
        return { status: 'skipped', reason: 'INVALID_TIMEFRAME' };
      }

      const candles = await this.prismaService.candle.findMany({
        where: {
          source: SOURCE,
          instrument,
          timeframe,
        },
        orderBy: { time: 'desc' },
        take: minCandles + 5,
      });

      if (candles.length < minCandles) {
        return { status: 'skipped', reason: 'INSUFFICIENT_DATA' };
      }

      const latest = candles[0];
      const previous = candles[1];
      if (!previous) {
        return { status: 'skipped', reason: 'INSUFFICIENT_DATA' };
      }

      const now = Date.now();
      const latestTime = latest.time.getTime();
      if (now - latestTime > 3 * timeframeMs) {
        return { status: 'skipped', reason: 'STALE_CANDLES' };
      }

      const gapMs = latestTime - previous.time.getTime();
      if (gapMs > 2 * timeframeMs) {
        return { status: 'skipped', reason: 'CANDLE_GAP' };
      }

      const processingState = await this.prismaService.signalProcessingState.findUnique({
        where: {
          source_instrument_timeframe_strategy: {
            source: SOURCE,
            instrument,
            timeframe,
            strategy,
          },
        },
      });

      if (processingState && latest.time <= processingState.lastProcessedCandleTime) {
        return { status: 'skipped', reason: 'NO_NEW_CANDLE' };
      }

      const cooldownKey = `cooldown:signal:${SOURCE}:${instrument}:${timeframe}:${strategy}`;
      const cooldownValue = await this.redisService.get(cooldownKey);
      if (cooldownValue) {
        await this.updateProcessingState(strategy, instrument, timeframe, latest.time);
        return { status: 'skipped', reason: 'COOLDOWN' };
      }

      const prevClose = previous.close;
      if (prevClose <= 0) {
        return { status: 'skipped', reason: 'INVALID_PREVIOUS_CLOSE' };
      }

      const lastClose = latest.close;
      const pctMove = ((lastClose - prevClose) / prevClose) * 100;

      const signalSide = this.evaluateSignalSide(pctMove);
      if (!signalSide) {
        await this.updateProcessingState(strategy, instrument, timeframe, latest.time);
        return { status: 'skipped', reason: 'NO_SIGNAL' };
      }

      const dedupKey = `${SOURCE}:${instrument}:${timeframe}:${strategy}:${signalSide}:${latest.time.toISOString()}`;
      const duplicate = await this.prismaService.signal.findUnique({ where: { dedupKey } });
      if (duplicate) {
        await this.updateProcessingState(strategy, instrument, timeframe, latest.time);
        return { status: 'skipped', reason: 'DUPLICATE' };
      }

      const confidence = Math.min(100, Math.round(Math.abs(pctMove) * 100));
      const reason =
        signalSide === 'BUY'
          ? `رشد ${pctMove.toFixed(2)}٪ نسبت به کندل قبل`
          : `افت ${Math.abs(pctMove).toFixed(2)}٪ نسبت به کندل قبل`;

      const rawPayload = {
        timeframe,
        instrument,
        source: SOURCE,
        candles: [this.serializeCandle(previous), this.serializeCandle(latest)],
      };

      const storedSignal = await this.prismaService.signal.create({
        data: {
          source: SOURCE,
          assetType: this.monitoringPlanService.getAssetType(instrument),
          instrument,
          interval: timeframe,
          strategy,
          kind: SIGNAL_KIND,
          side: signalSide,
          time: latest.time,
          price: lastClose,
          confidence,
          tags: ['engine', strategy],
          reason,
          dedupKey,
          rawPayload,
        },
      });

      await this.updateProcessingState(strategy, instrument, timeframe, latest.time);
      if (cooldownSeconds > 0) {
        await this.redisService.set(cooldownKey, '1', 'EX', cooldownSeconds);
      }
      await this.enqueueSignal(storedSignal);

      return { status: 'produced' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Signals engine failed for ${instrument} ${timeframe}: ${message}`);
      return { status: 'skipped', reason: 'ERROR' };
    }
  }

  private evaluateSignalSide(pctMove: number): 'BUY' | 'SELL' | null {
    if (pctMove >= STRATEGY_THRESHOLD_PERCENT) return 'BUY';
    if (pctMove <= -STRATEGY_THRESHOLD_PERCENT) return 'SELL';
    return null;
  }

  private async enqueueSignal(
    storedSignal: {
      id: string;
      source: string;
      assetType: string;
      instrument: string;
      interval: string;
      strategy: string;
      kind: string;
      side: string;
      price: number | null;
      time: Date;
      confidence: number;
      tags: string[];
      reason: string;
      why: string | null;
      indicators: unknown | null;
      levels: unknown | null;
      sl: number | null;
      tp1: number | null;
      tp2: number | null;
      externalId: string | null;
      rawPayload: unknown | null;
    },
  ): Promise<void> {
    await this.notificationOrchestrator.handleSignalCreated(storedSignal.id);
    this.logger.debug(
      `Signal orchestrator triggered (${storedSignal.instrument} ${storedSignal.interval} ${storedSignal.side})`,
    );
  }

  private async updateProcessingState(
    strategy: string,
    instrument: string,
    timeframe: string,
    time: Date,
  ): Promise<void> {
    await this.prismaService.signalProcessingState.upsert({
      where: {
        source_instrument_timeframe_strategy: {
          source: SOURCE,
          instrument,
          timeframe,
          strategy,
        },
      },
      update: {
        lastProcessedCandleTime: time,
      },
      create: {
        source: SOURCE,
        instrument,
        timeframe,
        strategy,
        lastProcessedCandleTime: time,
      },
    });
  }

  private serializeCandle(candle: {
    time: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number | null;
  }): Record<string, number | string | null> {
    return {
      time: candle.time.toISOString(),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume ?? null,
    };
  }

  private parseTimeframeToMs(timeframe: string): number | null {
    const match = timeframe.trim().toLowerCase().match(/^(\d+)([smhd])$/);
    if (!match) return null;

    const value = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(value) || value <= 0) return null;

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return null;
    }
  }

  private getDefaultSignalTimeframes(): string[] {
    const value = this.configService.get<string>('DEFAULT_SIGNAL_TIMEFRAMES', '');
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private async runWithConcurrency<T>(
    items: T[],
    concurrency: number,
    handler: (item: T) => Promise<void>,
  ): Promise<void> {
    if (items.length === 0) return;

    let index = 0;
    const limit = Math.max(1, Math.min(concurrency, items.length));

    const workers = Array.from({ length: limit }, async () => {
      while (index < items.length) {
        const currentIndex = index;
        index += 1;

        try {
          await handler(items[currentIndex]);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Signals engine pair failed: ${message}`);
        }
      }
    });

    await Promise.all(workers);
  }
}
