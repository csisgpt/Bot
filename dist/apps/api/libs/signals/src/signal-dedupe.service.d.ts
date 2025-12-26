import { ConfigService } from '@nestjs/config';
import { RedisService } from '@libs/core';
import { Signal } from './types';
import { buildSignalDedupeKey } from './dedupe';
export declare const buildSignalCooldownKey: (signal: Signal) => string;
export declare class SignalDedupeService {
    private readonly redisService;
    private readonly configService;
    constructor(redisService: RedisService, configService: ConfigService);
    isAllowed(signal: Signal): Promise<boolean>;
}
export { buildSignalDedupeKey };
