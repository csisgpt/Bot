import { Injectable } from '@nestjs/common';
import { JobRun } from '@prisma/client';
import { PrismaService } from './prisma.service';

@Injectable()
export class JobRunService {
  constructor(private readonly prismaService: PrismaService) {}

  async start(jobName: string, meta?: unknown): Promise<JobRun> {
    return this.prismaService.jobRun.create({
      data: {
        jobName,
        status: 'STARTED',
        meta: meta ?? undefined,
      },
    });
  }

  async success(jobRunId: string, meta?: unknown): Promise<JobRun> {
    return this.prismaService.jobRun.update({
      where: { id: jobRunId },
      data: {
        status: 'SUCCESS',
        endedAt: new Date(),
        meta: meta ?? undefined,
      },
    });
  }

  async fail(jobRunId: string, error: string, meta?: unknown): Promise<JobRun> {
    return this.prismaService.jobRun.update({
      where: { id: jobRunId },
      data: {
        status: 'FAILED',
        endedAt: new Date(),
        error,
        meta: meta ?? undefined,
      },
    });
  }
}
