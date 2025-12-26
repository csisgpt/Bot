import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as express from 'express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(express.text({ type: ['text/plain', 'text/*+plain'] }));
  const configService = app.get(ConfigService);
  const rawPort = process.env.PORT ?? configService.get<string>('PORT') ?? '3000';
  const parsedPort = Number(rawPort);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3000;
  await app.listen(port, '0.0.0.0');
}

bootstrap();
