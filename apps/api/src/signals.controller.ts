import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '@libs/core';
import { Prisma } from '@prisma/client';

@Controller('signals')
export class SignalsController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get()
  async listSignals(
    @Query('instrument') instrument?: string,
    @Query('interval') interval?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ): Promise<unknown[]> {
    const where: Prisma.SignalWhereInput = {};
    if (instrument) {
      where.instrument = instrument;
    }
    if (interval) {
      where.interval = interval;
    }

    const timeFilter: Prisma.DateTimeFilter = {};
    const fromDate = from ? new Date(from) : undefined;
    if (fromDate && !Number.isNaN(fromDate.getTime())) {
      timeFilter.gte = fromDate;
    }
    const toDate = to ? new Date(to) : undefined;
    if (toDate && !Number.isNaN(toDate.getTime())) {
      timeFilter.lte = toDate;
    }
    if (Object.keys(timeFilter).length > 0) {
      where.time = timeFilter;
    }

    const take = Math.min(Number(limit) || 100, 500);

    return this.prismaService.signal.findMany({
      where,
      orderBy: { time: 'desc' },
      take,
    });
  }
}
