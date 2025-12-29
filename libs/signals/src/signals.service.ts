import { Injectable } from '@nestjs/common';
import { PrismaService } from '@libs/core';
import { Signal } from './types';
import { Prisma } from '@prisma/client';


@Injectable()
export class SignalsService {
  constructor(private readonly prismaService: PrismaService) { }

  async storeSignal(signal: Signal): Promise<Signal & { id: string }> {
    const created = await this.prismaService.signal.create({
      data: {
        source: signal.source ?? 'BINANCE',
        assetType: signal.assetType,
        instrument: signal.instrument,
        interval: signal.interval,
        strategy: signal.strategy,
        kind: signal.kind,
        side: signal.side,
        time: new Date(signal.time),
        price: signal.price,
        confidence: signal.confidence,
        tags: signal.tags,
        reason: signal.reason,
        why: signal.why ?? undefined,
        indicators: signal.indicators ?? undefined,
        levels: signal.levels ? (signal.levels as any) : undefined,
        sl: signal.sl ?? signal.levels?.sl ?? undefined,
        tp1: signal.tp1 ?? signal.levels?.tp1 ?? undefined,
        tp2: signal.tp2 ?? signal.levels?.tp2 ?? undefined,
        externalId: signal.externalId ?? undefined,
        rawPayload: signal.rawPayload ?? undefined,
      },
    });

    return {
      ...signal,
      id: created.id,
    };
  }
}
