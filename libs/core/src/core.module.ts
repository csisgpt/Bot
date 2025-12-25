import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { envSchema } from './env.schema';
import { JobRunService } from './job-run.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
    }),
  ],
  providers: [PrismaService, RedisService, JobRunService],
  exports: [ConfigModule, PrismaService, RedisService, JobRunService],
})
export class CoreModule {}
