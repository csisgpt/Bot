import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@libs/core';
export declare class BinanceWsService implements OnModuleInit, OnModuleDestroy {
    private readonly configService;
    private readonly redisService;
    private readonly logger;
    private ws?;
    private reconnectTimeout?;
    private heartbeatInterval?;
    private shuttingDown;
    private readonly reconnectMs;
    private readonly ttlSeconds;
    constructor(configService: ConfigService, redisService: RedisService);
    onModuleInit(): void;
    onModuleDestroy(): Promise<void>;
    private connect;
    private getStreams;
    private handleMessage;
    private parseMessage;
    private startHeartbeat;
    private cleanupSocket;
    private scheduleReconnect;
    private parseList;
}
