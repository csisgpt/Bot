import { ConfigService } from '@nestjs/config';
import { RedisService } from '@libs/core';
import { Signal } from './types';
export declare const buildSignalDedupeKey: (signal: Signal) => string;
export declare const buildSignalCooldownKey: (signal: Signal) => string;
export declare class SignalDedupeService {
    private readonly redisService;
    private readonly configService;
    constructor(redisService: RedisService, configService: ConfigService);
    isAllowed(signal: Signal): Promise<boolean>;
    private getNumber;
}
