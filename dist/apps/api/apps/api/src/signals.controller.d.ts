import { PrismaService } from '@libs/core';
export declare class SignalsController {
    private readonly prismaService;
    constructor(prismaService: PrismaService);
    listSignals(instrument?: string, interval?: string, from?: string, to?: string, limit?: string): Promise<unknown[]>;
}
