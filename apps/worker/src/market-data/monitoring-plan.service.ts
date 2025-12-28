import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, RedisService } from '@libs/core';

export interface MonitoringPlan {
  activeSymbols: string[];
  activeTimeframes: string[];
}

@Injectable()
export class MonitoringPlanService {
  private readonly logger = new Logger(MonitoringPlanService.name);
  private readonly activeSymbolsKey = 'md:active:symbols';

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async buildPlan(): Promise<MonitoringPlan> {
    const configs = await this.prismaService.chatConfig.findMany({
      select: { watchlist: true, timeframes: true },
    });

    const watchlistSymbols = configs.flatMap((config) => config.watchlist ?? []);
    const timeframes = configs.flatMap((config) => config.timeframes ?? []);

    const defaultSymbols = this.parseList(
      this.configService.get<string>('UNIVERSE_DEFAULT_SYMBOLS', ''),
    );
    const maxSymbols = this.configService.get<number>('UNIVERSE_MAX_SYMBOLS', 100);

    const activeSymbols = this.uniqueSymbols(
      watchlistSymbols.length > 0 ? watchlistSymbols : defaultSymbols,
    ).slice(0, maxSymbols);

    const defaultTimeframes = this.parseList(
      this.configService.get<string>('DEFAULT_TIMEFRAMES', '5m,15m'),
    );
    const activeTimeframes = this.uniqueList([
      ...defaultTimeframes,
      ...timeframes,
      '1m',
    ]);

    await this.persistActiveSymbols(activeSymbols);

    return {
      activeSymbols,
      activeTimeframes,
    };
  }

  getAssetType(symbol: string): string {
    const normalized = this.normalizeSymbol(symbol);
    const goldSymbols = this.parseList(
      this.configService.get<string>('GOLD_INSTRUMENTS', ''),
    ).map(this.normalizeSymbol);
    if (goldSymbols.includes(normalized)) {
      return 'GOLD';
    }
    return 'CRYPTO';
  }

  private async persistActiveSymbols(symbols: string[]): Promise<void> {
    try {
      await this.redisService.set(this.activeSymbolsKey, JSON.stringify(symbols));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`ذخیره برنامه پایش در ردیس ناموفق بود: ${message}`);
    }
  }

  private uniqueSymbols(symbols: string[]): string[] {
    return this.uniqueList(symbols.map((symbol) => this.normalizeSymbol(symbol)));
  }

  private uniqueList(items: string[]): string[] {
    const set = new Set(items.map((item) => item.trim()).filter(Boolean));
    return Array.from(set);
  }

  private normalizeSymbol(symbol: string): string {
    return symbol
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');
  }

  private parseList(value?: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(String).map((x) => x.trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value.split(',').map((x) => x.trim()).filter(Boolean);
    }
    return [];
  }
}
