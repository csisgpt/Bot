import { Injectable } from '@nestjs/common';
import { PrismaService } from '@libs/core';
import { Signal } from './types';
import { Prisma } from '@prisma/client';


@Injectable()
export class SignalsService {
  constructor(private readonly prismaService: PrismaService) {}

  async storeSignal(signal: Signal): Promise<void> {
    await this.prismaService.signal.create({
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
        levels: signal.levels ? (signal.levels as any) : undefined,
                externalId: signal.externalId ?? undefined,
        rawPayload: signal.rawPayload ?? undefined,
      },
    });
  }
}
