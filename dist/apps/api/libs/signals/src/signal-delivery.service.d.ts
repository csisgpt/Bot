import { PrismaService } from '@libs/core';
import { SignalDelivery, TelegramDestination } from '@prisma/client';
export declare class SignalDeliveryService {
    private readonly prismaService;
    constructor(prismaService: PrismaService);
    createPendingDeliveries(signalId: string, destinations: TelegramDestination[]): Promise<SignalDelivery[]>;
}
