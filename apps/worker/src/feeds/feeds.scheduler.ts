import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';

import { feedsConfig, FeedConfig } from './feeds.config';
import { FeedRunnerService } from './feed-runner.service';

@Injectable()
export class FeedsSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(FeedsSchedulerService.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly runner: FeedRunnerService,
  ) {}

  onModuleInit(): void {
    for (const feed of feedsConfig) {
      this.registerFeed(feed);
    }
  }

  private registerFeed(feed: FeedConfig): void {
    if (!feed.enabled) return;

    // فقط feed هایی که schedule دارند (prices/news)
    if (!feed.schedule) return;

    if (feed.type !== 'prices' && feed.type !== 'news') return;

    const jobName = `feed:${feed.id}`;

    // جلوگیری از ثبت دوباره
    try {
      this.schedulerRegistry.getCronJob(jobName);
      this.logger.warn(`CronJob already exists: ${jobName}`);
      return;
    } catch {
      // ignore
    }

    const job = new CronJob(feed.schedule, () => {
      void this.runner.runFeed(feed.id, feed.type);
    });

    this.schedulerRegistry.addCronJob(jobName, job);
    job.start();

    this.logger.log(
      JSON.stringify({
        event: 'feed_cron_registered',
        feedId: feed.id,
        type: feed.type,
        schedule: feed.schedule,
      }),
    );
  }
}