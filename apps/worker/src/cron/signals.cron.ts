import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
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
import { SIGNALS_QUEUE_NAME } from '@libs/core';

@Injectable()
export class SignalsCron {
  private readonly logger = new Logger(SignalsCron.name);

  constructor(
    private readonly signalsService: SignalsService,
    private readonly configService: ConfigService,
    private readonly signalDedupeService: SignalDedupeService,
    private readonly feedRegistry: FeedRegistry,
    private readonly strategyRegistry: StrategyRegistry,
    @InjectQueue(SIGNALS_QUEUE_NAME) private readonly signalsQueue: Queue,
  ) {}

  @Cron('*/1 * * * *')
  async handleCron(): Promise<void> {
    const assetsEnabled = this.parseList(
      this.configService.get<string>('ASSETS_ENABLED', 'GOLD,CRYPTO'),
    )
      .map((asset) => asset.toUpperCase())
      .filter((asset): asset is AssetType => asset === 'GOLD' || asset === 'CRYPTO');
    const interval = this.configService.get<string>('BINANCE_INTERVAL', '15m');
    const limit = this.configService.get<number>('BINANCE_KLINES_LIMIT', 200);
    const strategiesEnabled = this.parseList(
      this.configService.get<string>('STRATEGIES_ENABLED', 'ema_rsi'),
    );
    const strategies = this.strategyRegistry.getByNames(strategiesEnabled);
    const riskLevelsEnabled = this.configService.get<boolean>('ENABLE_RISK_LEVELS', true);

    for (const assetType of assetsEnabled) {
      const feed = this.feedRegistry.getFeed(assetType);
      const instruments = this.getInstrumentsForAsset(assetType);

      for (const instrument of instruments) {
        try {
          const candles = await feed.getCandles({ instrument, interval, limit });
          if (candles.length < 2) {
            continue;
          }

          for (const strategy of strategies) {
            const rawSignal = strategy.run({ candles, instrument, interval, assetType });
            if (!rawSignal) {
              continue;
            }

            const signal = riskLevelsEnabled ? this.attachRiskLevels(rawSignal, candles) : rawSignal;
            const shouldProcess = await this.signalDedupeService.isAllowed(signal);
            if (!shouldProcess) {
              continue;
            }
            await this.signalsService.storeSignal(signal);
            await this.signalsQueue.add('sendTelegramSignal', signal, {
              removeOnComplete: true,
              removeOnFail: { count: 50 },
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(`Failed to process ${assetType}/${instrument}: ${message}`);
        }
      }
    }
  }

  private parseList(value?: string): string[] {
    return (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private getInstrumentsForAsset(assetType: AssetType): string[] {
    if (assetType === 'GOLD') {
      const instruments = this.parseList(
        this.configService.get<string>('GOLD_INSTRUMENTS', 'XAUTUSDT'),
      );
      return instruments.length > 0 ? instruments : ['XAUTUSDT'];
    }

    const cryptoInstruments = this.parseList(
      this.configService.get<string>('CRYPTO_INSTRUMENTS', ''),
    );
    if (cryptoInstruments.length > 0) {
      return cryptoInstruments;
    }

    const legacy = this.parseList(this.configService.get<string>('BINANCE_SYMBOLS', 'BTCUSDT'));
    return legacy.length > 0 ? legacy : ['BTCUSDT'];
  }

  private attachRiskLevels(signal: Signal, candles: Candle[]): Signal {
    const highs = candles.map((candle) => candle.high);
    const lows = candles.map((candle) => candle.low);
    const closes = candles.map((candle) => candle.close);
    const period = this.configService.get<number>('ATR_PERIOD', 14);
    const atrValues = atr(highs, lows, closes, period);
    const lastAtr = atrValues[candles.length - 1];

    if (!lastAtr || Number.isNaN(lastAtr)) {
      return signal;
    }

    const slMultiplier = this.configService.get<number>('SL_ATR_MULTIPLIER', 1.5);
    const tp1Multiplier = this.configService.get<number>('TP1_ATR_MULTIPLIER', 2);
    const tp2Multiplier = this.configService.get<number>('TP2_ATR_MULTIPLIER', 3);

    if (signal.side === 'BUY') {
      return {
        ...signal,
        levels: {
          entry: signal.price,
          sl: signal.price - lastAtr * slMultiplier,
          tp1: signal.price + lastAtr * tp1Multiplier,
          tp2: signal.price + lastAtr * tp2Multiplier,
        },
      };
    }

    if (signal.side === 'SELL') {
      return {
        ...signal,
        levels: {
          entry: signal.price,
          sl: signal.price + lastAtr * slMultiplier,
          tp1: signal.price - lastAtr * tp1Multiplier,
          tp2: signal.price - lastAtr * tp2Multiplier,
        },
      };
    }

    return signal;
  }
}
