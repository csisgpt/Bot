import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@libs/core';
import { Signal } from './types';

const toTimeBucket = (time: number): number => Math.floor(time / 60000);

export const buildSignalDedupeKey = (signal: Signal): string => {
  const source = signal.source ?? 'BINANCE';
  return `signal:${source}:${signal.assetType}:${signal.instrument}:${signal.interval}:${signal.strategy}:${signal.side}:${toTimeBucket(signal.time)}`;
};

// ✅ FIX: cooldown را هم به side وابسته می‌کنیم
export const buildSignalCooldownKey = (signal: Signal): string => {
  const source = signal.source ?? 'BINANCE';
  return `cooldown:${source}:${signal.assetType}:${signal.instrument}:${signal.interval}:${signal.strategy}`;
};

@Injectable()
export class SignalDedupeService {
  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  async isAllowed(signal: Signal): Promise<boolean> {

    const sendAllTv = this.configService.get<string>('TRADINGVIEW_SEND_ALL', 'true') === 'true';
    const source = signal.source ?? 'BINANCE';
  
    if (sendAllTv && source === 'TRADINGVIEW') {
      return true;
    }
    // (در Nest config ممکنه string برگرده؛ مطمئن‌تر parse می‌کنیم)
    const dedupeTtl = this.getNumber('SIGNAL_DEDUPE_TTL_SECONDS', 7200); // 2h
    const cooldownSeconds = this.getNumber('SIGNAL_MIN_COOLDOWN_SECONDS', 300); // 5m

    const dedupeKey = buildSignalDedupeKey(signal);
    const cooldownKey = buildSignalCooldownKey(signal);

    // ✅ اتمیک: اگر وجود داشته باشد set نمی‌شود
    // ioredis style: set(key, value, 'EX', seconds, 'NX')
    const dedupeSet = await this.redisService.set(dedupeKey, '1', 'EX', dedupeTtl, 'NX');
    if (dedupeSet !== 'OK') return false;

    // cooldown ممکنه 0 بشه برای خاموش کردن
    if (cooldownSeconds > 0) {
      const cooldownSet = await this.redisService.set(
        cooldownKey,
        '1',
        'EX',
        cooldownSeconds,
        'NX',
      );

      if (cooldownSet !== 'OK') {
        // برای اینکه dedupe بی‌جهت قفل نکند (اگر cooldown موجود بوده)
        await this.redisService.del(dedupeKey);
        return false;
      }
    }

    return true;
  }

  private getNumber(key: string, fallback: number): number {
    const raw = this.configService.get<string | number | undefined>(key);
    if (raw === undefined || raw === null || raw === '') return fallback;
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }
}
