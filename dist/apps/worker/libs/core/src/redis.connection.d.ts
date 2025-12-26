import { ConfigService } from '@nestjs/config';
import { RedisOptions } from 'ioredis';
export declare const createRedisConnection: (configService: ConfigService) => RedisOptions;
