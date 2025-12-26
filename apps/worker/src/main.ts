import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule);
  const configService = app.get(ConfigService);
  const renderPort = configService.get<string>('PORT');
  const workerPort = configService.get<string>('WORKER_PORT');
  const parsePort = (value?: string): number | null => {
    if (!value) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const port = parsePort(renderPort) ?? parsePort(workerPort) ?? 3001;
  const host = '0.0.0.0';
  const logger = new Logger('WorkerBootstrap');

  await app.listen(port, host);
  logger.log(`Worker listening on ${host}:${port}`);
}

bootstrap();
