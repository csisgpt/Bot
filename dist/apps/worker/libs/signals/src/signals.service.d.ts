import { PrismaService } from '@libs/core';
import { Signal } from './types';
export declare class SignalsService {
    private readonly prismaService;
    constructor(prismaService: PrismaService);
    storeSignal(signal: Signal): Promise<void>;
}
