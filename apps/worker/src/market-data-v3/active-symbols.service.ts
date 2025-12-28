import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, RedisService } from '@libs/core';
import { normalizeCanonicalSymbol } from '@libs/market-data';
import { MonitoringPlanService } from '../market-data/monitoring-plan.service';

@Injectable()
export class ActiveSymbolsService {
  private readonly logger = new Logger(ActiveSymbolsService.name);
  private activeSymbols: string[] = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly redisService: RedisService,
    @Optional()
    private readonly monitoringPlanService?: MonitoringPlanService,
  ) {}

  async resolveActiveSymbols(): Promise<string[]> {
    const watchlists = await this.prismaService.chatConfig.findMany({
      select: { watchlist: true },
    });

    const union = new Set<string>();
    for (const item of watchlists) {
      for (const symbol of item.watchlist ?? []) {
        const normalized = normalizeCanonicalSymbol(symbol);
        if (normalized) {
          union.add(normalized);
        }
      }
    }

    const fallback = this.configService.get<string[]>('UNIVERSE_DEFAULT_SYMBOLS', []);
    if (union.size === 0) {
      if (this.monitoringPlanService) {
        const plan = await this.monitoringPlanService.buildPlan();
        plan.activeSymbols
          .map((symbol) => normalizeCanonicalSymbol(symbol))
          .filter(Boolean)
          .forEach((symbol) => union.add(symbol));
      }
      fallback
        .map((symbol) => normalizeCanonicalSymbol(symbol))
        .filter(Boolean)
        .forEach((symbol) => union.add(symbol));
    }

    const maxSymbols = this.configService.get<number>('UNIVERSE_MAX_SYMBOLS', 100);
    this.activeSymbols = Array.from(union).slice(0, maxSymbols);

    await this.redisService.set('md:active:symbols', JSON.stringify(this.activeSymbols));

    if (this.activeSymbols.length === 0) {
      this.logger.warn('هیچ نماد فعالی برای بازار چندمنبعی یافت نشد');
    }

    return [...this.activeSymbols];
  }

  getActiveSymbols(): string[] {
    return [...this.activeSymbols];
  }
}
