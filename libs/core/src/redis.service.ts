import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createRedisConnection } from './redis.connection';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    super(createRedisConnection(configService));
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
  }
}
