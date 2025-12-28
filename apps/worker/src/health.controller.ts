import { Controller, Get } from '@nestjs/common';
import { PrismaService, RedisService } from '@libs/core';
import { getPriceCacheKey } from '@libs/binance';
import { MonitoringPlanService } from './market-data/monitoring-plan.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly monitoringPlanService: MonitoringPlanService,
  ) {}

  @Get()
  health(): { ok: true } {
    return { ok: true };
  }

  @Get('market-data')
  async marketData(): Promise<{
    ok: true;
    sampleSymbol: string | null;
    lastPriceTs: number | null;
    lastCandleTime: string | null;
    activeSymbolsCount: number;
  }> {
    const plan = await this.monitoringPlanService.buildPlan();
    const sampleSymbol = plan.activeSymbols[0] ?? null;
    let lastPriceTs: number | null = null;
    let lastCandleTime: string | null = null;

    if (sampleSymbol) {
      const cached = await this.redisService.get(getPriceCacheKey(sampleSymbol, 'BINANCE'));
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as { ts?: number } | null;
          if (parsed?.ts && Number.isFinite(parsed.ts)) {
            lastPriceTs = parsed.ts;
          }
        } catch (error) {
          lastPriceTs = null;
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
        lastCandleTime = latestCandle.time.toISOString();
      }
    }

    return {
      ok: true,
      sampleSymbol,
      lastPriceTs,
      lastCandleTime,
      activeSymbolsCount: plan.activeSymbols.length,
    };
  }
}
