import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, RedisService } from '@libs/core';
import {
  ArbitrageEngine,
  CrossExchangeSpreadStrategy,
  DepthAwareArbitrageStrategy,
  FundingDivergenceStrategy,
  InstrumentRegistryService,
  ProviderRegistryService,
  TriangularArbitrageStrategy,
  ArbitrageSnapshot,
  Ticker,
} from '@libs/market-data';
import { NotificationOrchestratorService } from '../notifications/notification-orchestrator.service';

@Injectable()
export class ArbitrageScannerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ArbitrageScannerService.name);
  private readonly enabled: boolean;
  private readonly scanIntervalMs: number;
  private readonly staleMs: number;
  private readonly cooldownSeconds: number;
  private readonly dedupeTtlSeconds: number;
  private timer?: NodeJS.Timeout;
  private lastScanAt: number | null = null;
  private lastOpportunities = 0;
  private lastStaleCount = 0;
  private readonly engine: ArbitrageEngine;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly prismaService: PrismaService,
    private readonly instrumentRegistry: InstrumentRegistryService,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly notificationOrchestrator: NotificationOrchestratorService,
  ) {
    this.enabled = configService.get<boolean>('ARB_ENABLED', true);
    this.scanIntervalMs =
      configService.get<number>('ARB_SCAN_INTERVAL_SECONDS', 5) * 1000;
    this.staleMs = configService.get<number>('ARB_STALE_MS', 15000);
    this.cooldownSeconds = configService.get<number>('ARB_COOLDOWN_SECONDS', 60);
    this.dedupeTtlSeconds = configService.get<number>('ARB_DEDUPE_TTL_SECONDS', 300);

    const feeBps = {
      binance: configService.get<number>('PROVIDER_TAKER_FEE_BPS_BINANCE', 10),
      bybit: configService.get<number>('PROVIDER_TAKER_FEE_BPS_BYBIT', 10),
      okx: configService.get<number>('PROVIDER_TAKER_FEE_BPS_OKX', 10),
      kcex: configService.get<number>('PROVIDER_TAKER_FEE_BPS_KCEX', 10),
    };

    const strategies = [
      new CrossExchangeSpreadStrategy({
        minSpreadPct: configService.get<number>('ARB_MIN_SPREAD_PCT', 0.2),
        minNetPct: configService.get<number>('ARB_MIN_NET_PCT', 0.05),
        feeBps,
      }),
      new FundingDivergenceStrategy(configService.get<boolean>('ARB_FUNDING_ENABLED', false)),
      new TriangularArbitrageStrategy(configService.get<boolean>('ARB_TRIANGULAR_ENABLED', false)),
      new DepthAwareArbitrageStrategy(configService.get<boolean>('ARB_DEPTH_ENABLED', false)),
    ];

    this.engine = new ArbitrageEngine(strategies);
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('آربیتراژ غیرفعال است');
      return;
    }
    this.timer = setInterval(() => {
      void this.scanOnce();
    }, this.scanIntervalMs);
    void this.scanOnce();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  getHealth(): {
    lastScanAt: number | null;
    opportunities: number;
    staleSnapshots: number;
  } {
    return {
      lastScanAt: this.lastScanAt,
      opportunities: this.lastOpportunities,
      staleSnapshots: this.lastStaleCount,
    };
  }

  private async scanOnce(): Promise<void> {
    const snapshot = await this.buildSnapshot();
    this.lastScanAt = snapshot.ts;
    const opportunities = this.engine.scan(snapshot);
    let saved = 0;

    for (const opportunity of opportunities) {
      const dedupKey = this.buildDedupKey(opportunity);
      const cooldownKey = this.buildCooldownKey(opportunity);

      const [dedupeOk, cooldownOk] = await Promise.all([
        this.redisService.set(
          `arb:dedupe:${dedupKey}`,
          '1',
          'EX',
          this.dedupeTtlSeconds,
          'NX',
        ),
        this.redisService.set(
          `arb:cooldown:${cooldownKey}`,
          '1',
          'EX',
          this.cooldownSeconds,
          'NX',
        ),
      ]);

      if (!dedupeOk || !cooldownOk) {
        continue;
      }

      opportunity.dedupKey = dedupKey;
      try {
        const record = await this.prismaService.arbOpportunity.create({
          data: {
            canonicalSymbol: opportunity.canonicalSymbol,
            ts: new Date(opportunity.ts),
            kind: opportunity.kind,
            buyExchange: opportunity.buyExchange,
            sellExchange: opportunity.sellExchange,
            buyPrice: opportunity.buyPrice,
            sellPrice: opportunity.sellPrice,
            spreadAbs: opportunity.spreadAbs,
            spreadPct: opportunity.spreadPct,
            netPct: opportunity.netPct ?? null,
            confidence: opportunity.confidence,
            reason: opportunity.reason,
            dedupKey,
          },
        });
        saved += 1;
        await this.notificationOrchestrator.handleArbCreated(record.id);
      } catch (error) {
        if (this.isUniqueViolation(error)) {
          continue;
        }
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          JSON.stringify({ event: 'arb_store_failed', message, dedupKey }),
        );
      }
    }

    this.lastOpportunities = saved;
    if (saved > 0) {
      this.logger.log(`آربیتراژ جدید ثبت شد: ${saved}`);
    }
  }

  private async buildSnapshot(): Promise<ArbitrageSnapshot> {
    const enabledProviders = this.providerRegistry
      .getEnabledProviders()
      .map((provider) => provider.provider);
    const allowedProviders = this.configService
      .get<string>('ARB_ENABLED_PROVIDERS', enabledProviders.join(','))
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .filter((provider) => enabledProviders.includes(provider));
    const instruments = this.instrumentRegistry.getInstruments();

    const keys: string[] = [];
    const keyMap: Array<{ symbol: string; provider: string; key: string }> = [];

    for (const instrument of instruments) {
      for (const provider of allowedProviders) {
        const key = `latest:book:${instrument.canonicalSymbol}:${provider}`;
        keys.push(key);
        keyMap.push({ symbol: instrument.canonicalSymbol, provider, key });
      }
    }

    const values = keys.length ? await this.redisService.mget(...keys) : [];
    const tickers: Record<string, Record<string, Ticker>> = {};
    let staleCount = 0;
    const now = Date.now();

    keyMap.forEach((entry, index) => {
      const raw = values[index];
      if (!raw) {
        return;
      }
      try {
        const parsed = JSON.parse(raw) as Ticker;
        if (!parsed?.ts || now - parsed.ts > this.staleMs) {
          staleCount += 1;
          return;
        }
        if (!tickers[entry.symbol]) {
          tickers[entry.symbol] = {};
        }
        tickers[entry.symbol][entry.provider] = parsed;
      } catch (error) {
        return;
      }
    });

    this.lastStaleCount = staleCount;
    return { ts: now, tickers };
  }

  private buildDedupKey(opportunity: {
    kind: string;
    canonicalSymbol: string;
    buyExchange: string;
    sellExchange: string;
    ts: number;
  }): string {
    const minuteBucket = Math.floor(opportunity.ts / 60000);
    return `${opportunity.kind}:${opportunity.canonicalSymbol}:${opportunity.buyExchange}:${opportunity.sellExchange}:${minuteBucket}`;
  }

  private buildCooldownKey(opportunity: {
    kind: string;
    canonicalSymbol: string;
    buyExchange: string;
    sellExchange: string;
  }): string {
    return `${opportunity.kind}:${opportunity.canonicalSymbol}:${opportunity.buyExchange}:${opportunity.sellExchange}`;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    );
  }
}
