import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@libs/core';
import { Signal } from './types';

const toTimeBucket = (time: number): number => Math.floor(time / 60000);

export const buildSignalDedupeKey = (signal: Signal): string => {
  const source = signal.source ?? 'BINANCE';
  return `signal:${source}:${signal.assetType}:${signal.instrument}:${signal.interval}:${signal.strategy}:${signal.side}:${toTimeBucket(signal.time)}`;
};

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
    const dedupeTtl = this.configService.get<number>('SIGNAL_DEDUPE_TTL_SECONDS', 7200);
    const cooldownSeconds = this.configService.get<number>('SIGNAL_MIN_COOLDOWN_SECONDS', 300);
    const dedupeKey = buildSignalDedupeKey(signal);
    const cooldownKey = buildSignalCooldownKey(signal);
    const [dedupeExists, cooldownExists] = await Promise.all([
      this.redisService.get(dedupeKey),
      this.redisService.get(cooldownKey),
    ]);

    if (dedupeExists || cooldownExists) {
      return false;
    }

    await Promise.all([
      this.redisService.set(dedupeKey, '1', 'EX', dedupeTtl),
      this.redisService.set(cooldownKey, '1', 'EX', cooldownSeconds),
    ]);

    return true;
  }
}
