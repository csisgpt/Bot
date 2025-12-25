import { Injectable } from '@nestjs/common';
import { PrismaService } from '@libs/core';
import { SignalDelivery, TelegramDestination } from '@prisma/client';

@Injectable()
export class SignalDeliveryService {
  constructor(private readonly prismaService: PrismaService) {}

  async createPendingDeliveries(
    signalId: string,
    destinations: TelegramDestination[],
  ): Promise<SignalDelivery[]> {
    if (destinations.length === 0) {
      return [];
    }

    const deliveries = await this.prismaService.$transaction(
      destinations.map((destination) =>
        this.prismaService.signalDelivery.upsert({
          where: {
            signalId_destinationId: {
              signalId,
              destinationId: destination.id,
            },
          },
          create: {
            signalId,
            destinationId: destination.id,
            status: 'PENDING',
          },
          update: {},
        }),
      ),
    );

    return deliveries;
  }
}
