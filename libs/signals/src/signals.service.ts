import { Injectable } from '@nestjs/common';
import { PrismaService } from '@libs/core';
import { StrategySignal } from './strategy';

@Injectable()
export class SignalsService {
  constructor(private readonly prismaService: PrismaService) {}

  async storeSignal(signal: StrategySignal): Promise<void> {
    await this.prismaService.signal.create({
      data: {
        symbol: signal.symbol,
        interval: signal.interval,
        type: signal.type,
        time: new Date(signal.time),
        price: signal.price,
        emaFast: signal.emaFast,
        emaSlow: signal.emaSlow,
        rsi: signal.rsi,
      },
    });
  }
}
