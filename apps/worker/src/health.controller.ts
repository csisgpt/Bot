import { Controller, Get } from '@nestjs/common';
import { PrismaService, RedisService, MARKET_DATA_QUEUE_NAME, SIGNALS_QUEUE_NAME } from '@libs/core';
import { getPriceCacheKey } from '@libs/binance';
import { MonitoringPlanService } from './market-data/monitoring-plan.service';
import { ConfigService } from '@nestjs/config';
import { ProviderRegistryService } from '@libs/market-data';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ArbitrageScannerService } from './arbitrage/arbitrage-scanner.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly monitoringPlanService: MonitoringPlanService,
    private readonly configService: ConfigService,
    private readonly providerRegistryService: ProviderRegistryService,
    private readonly arbitrageScannerService: ArbitrageScannerService,
    @InjectQueue(SIGNALS_QUEUE_NAME)
    private readonly signalsQueue: Queue,
    @InjectQueue(MARKET_DATA_QUEUE_NAME)
    private readonly marketDataQueue: Queue,
  ) {}

  @Get()
  health(): { ok: true } {
    return { ok: true };
  }

  @Get('market-data')
  async marketData(): Promise<{
    ok: true;
    sampleSymbol: string | null;
    priceTs: number | null;
    last1mCandleTime: string | null;
    activeSymbolsCount: number;
    isPriceStale: boolean;
    isCandleStale: boolean;
  }> {
    const plan = await this.monitoringPlanService.buildPlan();
    const sampleSymbol = plan.activeSymbols[0] ?? null;
    let priceTs: number | null = null;
    let last1mCandleTime: string | null = null;

    if (sampleSymbol) {
      const cached = await this.redisService.get(getPriceCacheKey(sampleSymbol, 'BINANCE'));
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as { ts?: number } | null;
          if (parsed?.ts && Number.isFinite(parsed.ts)) {
            priceTs = parsed.ts;
          }
        } catch (error) {
          priceTs = null;
        }
      }

      const latestCandle = await this.prismaService.candle.findFirst({
        where: {
          source: 'BINANCE',
          instrument: sampleSymbol,
          timeframe: '1m',
        },
        orderBy: { time: 'desc' },
      });
      if (latestCandle) {
        last1mCandleTime = latestCandle.time.toISOString();
      }
    }

    const now = Date.now();
    const priceCacheTtlMs =
      this.configService.get<number>('PRICE_CACHE_TTL_SECONDS', 120) * 1000;
    const priceStaleThresholdMs = Math.max(priceCacheTtlMs * 2, 120_000);
    const isPriceStale = !priceTs || now - priceTs > priceStaleThresholdMs;
    const lastCandleMs = last1mCandleTime ? Date.parse(last1mCandleTime) : NaN;
    const isCandleStale =
      !Number.isFinite(lastCandleMs) || now - lastCandleMs > 180_000;

    return {
      ok: true,
      sampleSymbol,
      priceTs,
      last1mCandleTime,
      activeSymbolsCount: plan.activeSymbols.length,
      isPriceStale,
      isCandleStale,
    };
  }

  @Get('providers')
  providers(): { ok: true; providers: ReturnType<ProviderRegistryService['getSnapshots']> } {
    return { ok: true, providers: this.providerRegistryService.getSnapshots() };
  }

  @Get('queues')
  async queues(): Promise<{
    ok: true;
    signals: Record<string, number>;
    marketData: Record<string, number>;
  }> {
    const [signals, marketData] = await Promise.all([
      this.signalsQueue.getJobCounts('wait', 'active', 'delayed', 'failed', 'completed'),
      this.marketDataQueue.getJobCounts('wait', 'active', 'delayed', 'failed', 'completed'),
    ]);

    return { ok: true, signals, marketData };
  }

  @Get('arbitrage')
  arbitrage(): {
    ok: true;
    lastScanAt: number | null;
    opportunities: number;
    staleSnapshots: number;
  } {
    const health = this.arbitrageScannerService.getHealth();
    return { ok: true, ...health };
  }
}
