import { JobRun } from '@prisma/client';
import { PrismaService } from './prisma.service';
export declare class JobRunService {
    private readonly prismaService;
    constructor(prismaService: PrismaService);
    start(jobName: string, meta?: unknown): Promise<JobRun>;
    success(jobRunId: string, meta?: unknown): Promise<JobRun>;
    fail(jobRunId: string, error: string, meta?: unknown): Promise<JobRun>;
}
