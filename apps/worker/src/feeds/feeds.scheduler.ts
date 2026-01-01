import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { feedsConfig, FeedConfig } from './feeds.config';
import { FeedRunnerService } from './feed-runner.service';

@Injectable()
export class FeedsSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(FeedsSchedulerService.name);

  constructor(
    private readonly scheduler: SchedulerRegistry,
    private readonly runner: FeedRunnerService,
  ) {}

  onModuleInit(): void {
    for (const feed of feedsConfig) {
      if (!feed.enabled) continue;

      const name = `feed:${feed.id}`;
      if (this.scheduler.doesExist('cron', name)) {
        this.scheduler.deleteCronJob(name);
      }

      const job = new CronJob(feed.schedule, () => this.safeRun(feed));

      this.scheduler.addCronJob(name, job);
      job.start();

      this.logger.log(
        JSON.stringify({ event: 'feed_scheduled', id: feed.id, type: feed.type, schedule: feed.schedule }),
      );
    }
  }

  private async safeRun(feed: FeedConfig): Promise<void> {
    try {
      await this.runner.runFeed(feed.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      this.logger.warn(JSON.stringify({ event: 'feed_run_failed', id: feed.id, type: feed.type, message: msg }));
    }
  }
}