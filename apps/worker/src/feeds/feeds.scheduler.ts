import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { feedsConfig } from './feeds.config';
import { FeedRunnerService } from './feed-runner.service';

@Injectable()
export class FeedsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedsScheduler.name);
  private readonly jobs: CronJob[] = [];
  private readonly running = new Set<string>();

  constructor(
    private readonly runner: FeedRunnerService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const flag = (this.config.get<string>('FEEDS_SCHEDULER_ENABLED') ?? '').trim().toLowerCase();
    if (flag && ['0', 'false', 'no', 'off'].includes(flag)) {
      this.logger.log('Feeds scheduler disabled (FEEDS_SCHEDULER_ENABLED=false).');
      return;
    }

    const timezone = this.config.get<string>('APP_TIMEZONE') || 'UTC';

    for (const feed of feedsConfig) {
      if (!feed.enabled) continue;
      if (!feed.schedule) continue;

      const key = `${feed.type}:${feed.id}`;

      const job = new CronJob(
        feed.schedule,
        async () => {
          if (this.running.has(key)) return; // جلوگیری از overlap
          this.running.add(key);
          try {
            await this.runner.runFeed(feed.id, feed.type);
          } catch (err) {
            this.logger.error(
              `Feed run failed: ${key}`,
              err instanceof Error ? err.stack : String(err),
            );
          } finally {
            this.running.delete(key);
          }
        },
        null,
        false,
        timezone,
      );

      job.start();
      this.jobs.push(job);
      this.logger.log(`Scheduled feed ${key} (${feed.schedule}) tz=${timezone}`);
    }
  }

  onModuleDestroy(): void {
    for (const job of this.jobs) job.stop();
    this.jobs.length = 0;
  }
}