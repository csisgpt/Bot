import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '@libs/core';
import { DeliveryStatus, Prisma } from '@prisma/client';

@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get()
  async listDeliveries(
    @Query('status') status?: DeliveryStatus,
    @Query('destinationId') destinationId?: string,
    @Query('limit') limit?: string,
  ): Promise<unknown[]> {
    const where: Prisma.SignalDeliveryWhereInput = {};
    if (status) {
      where.status = status;
    }
    if (destinationId) {
      where.destinationId = destinationId;
    }

    const take = Math.min(Number(limit) || 100, 500);

    return this.prismaService.signalDelivery.findMany({
      where,
      include: { signal: true, destination: true },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
