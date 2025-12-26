import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@libs/core';
export declare class SeedService implements OnModuleInit {
    private readonly prismaService;
    private readonly configService;
    private readonly logger;
    constructor(prismaService: PrismaService, configService: ConfigService);
    onModuleInit(): Promise<void>;
    seed(): Promise<{
        strategies: number;
        instruments: number;
        destinations: number;
        rules: number;
    }>;
    private ensureInstruments;
    private ensureDestinations;
    private ensureRoutingRules;
    private getDestinationTargets;
    private parseList;
}
