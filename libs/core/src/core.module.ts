import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { envSchemaWithRefinements } from './env.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate:
        process.env.NODE_ENV === 'test'
          ? undefined
          : (config) => envSchemaWithRefinements.parse(config),
    }),
  ],
  providers: [PrismaService, RedisService],
  exports: [ConfigModule, PrismaService, RedisService],
})
export class CoreModule {}
