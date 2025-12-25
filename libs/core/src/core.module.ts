import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { envSchema } from './env.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
    }),
  ],
  providers: [PrismaService, RedisService],
  exports: [ConfigModule, PrismaService, RedisService],
})
export class CoreModule {}
