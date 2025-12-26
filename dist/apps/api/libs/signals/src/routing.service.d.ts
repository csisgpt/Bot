import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@libs/core';
import { RoutingRule, TelegramDestination } from '@prisma/client';
import { Signal } from './types';
export interface RoutingContext {
    instrumentId?: string | null;
    strategyId?: string | null;
}
export declare const matchesRoutingRule: (rule: Pick<RoutingRule, "assetType" | "instrumentId" | "strategyId" | "interval" | "minConfidence">, signal: Signal, context: RoutingContext) => boolean;
export declare class RoutingService {
    private readonly prismaService;
    private readonly configService;
    private readonly logger;
    constructor(prismaService: PrismaService, configService: ConfigService);
    resolveDestinations(signal: Signal): Promise<TelegramDestination[]>;
    private ensureFallbackDestinations;
    private getFallbackTargets;
}
