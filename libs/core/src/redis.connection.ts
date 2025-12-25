import { ConfigService } from '@nestjs/config';
import { RedisOptions } from 'ioredis';

const DEFAULT_REDIS_PORT = 6379;

const buildRedisOptionsFromUrl = (redisUrl: string): RedisOptions => {
  const url = new URL(redisUrl);
  const options: RedisOptions = {
    host: url.hostname,
    port: url.port ? Number(url.port) : DEFAULT_REDIS_PORT,
  };

  if (url.username) {
    options.username = url.username;
  }

  if (url.password) {
    options.password = url.password;
  }

  if (url.pathname && url.pathname !== '/') {
    const db = Number(url.pathname.replace('/', ''));
    if (!Number.isNaN(db)) {
      options.db = db;
    }
  }

  if (url.protocol === 'rediss:') {
    options.tls = {};
  }

  return options;
};

export const createRedisConnection = (configService: ConfigService): RedisOptions => {
  const redisUrl = configService.get<string>('REDIS_URL');
  if (redisUrl) {
    return buildRedisOptionsFromUrl(redisUrl);
  }

  return {
    host: configService.get<string>('REDIS_HOST', 'localhost'),
    port: configService.get<number>('REDIS_PORT', DEFAULT_REDIS_PORT),
    password: configService.get<string>('REDIS_PASSWORD'),
  };
};
