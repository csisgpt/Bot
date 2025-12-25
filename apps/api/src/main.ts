import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { text } from 'express';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(text({ type: ['text/plain', 'text/*+plain'] }));
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);
}

bootstrap();
