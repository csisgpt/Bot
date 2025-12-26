import { Signal as PrismaSignal } from '@prisma/client';
import { PrismaService } from '@libs/core';
import { Signal } from './types';
interface StoreSignalOptions {
    persistRawPayload?: boolean;
}
export declare class SignalsService {
    private readonly prismaService;
    constructor(prismaService: PrismaService);
    storeSignal(signal: Signal, options?: StoreSignalOptions): Promise<PrismaSignal | null>;
}
export {};
