import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [PrismaService, RedisService],
  exports: [ConfigModule, PrismaService, RedisService],
})
export class CoreModule {}
