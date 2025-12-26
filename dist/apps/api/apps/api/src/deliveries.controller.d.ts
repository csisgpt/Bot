import { PrismaService } from '@libs/core';
import { DeliveryStatus } from '@prisma/client';
export declare class DeliveriesController {
    private readonly prismaService;
    constructor(prismaService: PrismaService);
    listDeliveries(status?: DeliveryStatus, destinationId?: string, limit?: string): Promise<unknown[]>;
}
