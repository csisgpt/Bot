import { Injectable } from '@nestjs/common';
import { Prisma, Signal as PrismaSignal } from '@prisma/client';
import { PrismaService } from '@libs/core';
import { Signal } from './types';
import { buildSignalDedupeKey } from './dedupe';

interface StoreSignalOptions {
  persistRawPayload?: boolean;
}

@Injectable()
export class SignalsService {
  constructor(private readonly prismaService: PrismaService) {}

  async storeSignal(
    signal: Signal,
    options: StoreSignalOptions = {},
  ): Promise<PrismaSignal | null> {
    const dedupeKey = buildSignalDedupeKey(signal);
    const price =
      signal.price === null || signal.price === undefined
        ? null
        : new Prisma.Decimal(signal.price);
    const persistRawPayload = options.persistRawPayload ?? true;

    try {
      return await this.prismaService.signal.create({
        data: {
          source: signal.source ?? 'BINANCE',
          assetType: signal.assetType,
          instrument: signal.instrument,
          interval: signal.interval,
          strategy: signal.strategy,
          kind: signal.kind,
          side: signal.side,
          time: new Date(signal.time),
          price,
          confidence: signal.confidence,
          tags: signal.tags,
          reason: signal.reason,
          levels: signal.levels ?? undefined,
          externalId: signal.externalId ?? undefined,
          rawPayload: persistRawPayload ? signal.rawPayload ?? undefined : undefined,
          dedupeKey,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return null;
      }
      throw error;
    }
  }
}
