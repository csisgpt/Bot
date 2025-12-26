import { PrismaService } from '@libs/core';
export declare class HealthController {
    private readonly prismaService;
    constructor(prismaService: PrismaService);
    health(): {
        status: string;
    };
    dbHealth(): Promise<{
        status: string;
    }>;
}
