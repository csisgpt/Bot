import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '@libs/core';

@Controller('health')
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  @Get()
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Get('db')
  async dbHealth(): Promise<{ status: string }> {
    await this.prismaService.signal.count({ take: 1 });
    return { status: 'ok' };
  }
}
