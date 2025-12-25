import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Telegraf } from 'telegraf';

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
};

const buildRedisConnection = (): Redis => {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL);
  }

  return new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  });
};

const sendTelegramTest = async (): Promise<void> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.warn('TELEGRAM_BOT_TOKEN is not set. Skipping Telegram test.');
    return;
  }

  const channelId = process.env.TELEGRAM_SIGNAL_CHANNEL_ID;
  const groupId = process.env.TELEGRAM_SIGNAL_GROUP_ID;
  const destination = channelId || groupId;

  if (!destination) {
    console.warn('No Telegram destination configured. Skipping Telegram test.');
    return;
  }

  const bot = new Telegraf(token);
  const message = `✅ Smoke test (${new Date().toISOString()})`;
  await bot.telegram.sendMessage(destination, message, {
    parse_mode: process.env.TELEGRAM_PARSE_MODE ?? 'HTML',
    disable_web_page_preview: (process.env.TELEGRAM_DISABLE_WEB_PAGE_PREVIEW ?? 'true') === 'true',
  });
};

const main = async (): Promise<void> => {
  const prisma = new PrismaClient();
  const databaseUrl = requireEnv('DATABASE_URL');
  if (!databaseUrl.includes('sslmode=require')) {
    console.warn('DATABASE_URL should include sslmode=require for Liara Postgres.');
  }

  await prisma.$queryRaw`SELECT 1`;
  await prisma.$disconnect();
  console.info('✅ Postgres connection OK');

  const redis = buildRedisConnection();
  await redis.ping();
  await redis.quit();
  console.info('✅ Redis connection OK');

  await sendTelegramTest();
  console.info('✅ Telegram test completed');
};

main().catch((error) => {
  console.error('Smoke test failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
