import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const maxBodyKb = Number(configService.get<number>('WEBHOOK_MAX_BODY_KB', 64));
  const limit = Number.isFinite(maxBodyKb) ? `${maxBodyKb}kb` : '64kb';
  app.use(express.json({ limit }));
  app.use(express.urlencoded({ extended: true, limit }));
  app.use(express.text({ type: ['text/plain', 'text/*+plain'], limit }));
  const rawPort = process.env.PORT ?? configService.get<string>('PORT') ?? '3000';
  const parsedPort = Number(rawPort);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
