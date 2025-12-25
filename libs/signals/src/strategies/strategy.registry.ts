import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Strategy } from './types';
import { createEmaRsiStrategy } from './ema-rsi.strategy';
import { createRsiThresholdStrategy } from './rsi-threshold.strategy';
import { createBreakoutStrategy } from './breakout.strategy';
import { createMacdStrategy } from './macd.strategy';

@Injectable()
export class StrategyRegistry {
  private readonly strategies: Strategy[];

  constructor(private readonly configService: ConfigService) {
    const rsiPeriod = this.configService.get<number>('RSI_PERIOD', 14);
    const rsiBuyThreshold = this.configService.get<number>('RSI_BUY_THRESHOLD', 30);
    const rsiSellThreshold = this.configService.get<number>('RSI_SELL_THRESHOLD', 70);
    const emaFastPeriod = this.configService.get<number>('EMA_FAST_PERIOD', 12);
    const emaSlowPeriod = this.configService.get<number>('EMA_SLOW_PERIOD', 26);
    const breakoutLookback = this.configService.get<number>('BREAKOUT_LOOKBACK', 20);

    this.strategies = [
      createEmaRsiStrategy({
        emaFastPeriod,
        emaSlowPeriod,
        rsiPeriod,
        rsiBuyThreshold,
        rsiSellThreshold,
      }),
      createRsiThresholdStrategy({ rsiPeriod, rsiBuyThreshold, rsiSellThreshold }),
      createBreakoutStrategy({ lookback: breakoutLookback }),
      createMacdStrategy({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }),
    ];
  }

  getAll(): Strategy[] {
    return this.strategies;
  }

  getByNames(names: string[]): Strategy[] {
    const normalized = names.map((name) => name.trim()).filter(Boolean);
    if (normalized.length === 0) {
      return this.strategies;
    }

    return this.strategies.filter((strategy) => normalized.includes(strategy.name));
  }
}
