import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule);
  const configService = app.get(ConfigService);
  const port = configService.get<number>('WORKER_PORT', 3001);
  await app.listen(port);
}

bootstrap();
