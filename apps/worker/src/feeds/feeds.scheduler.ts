// apps/worker/src/feeds/feeds.scheduler.ts

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { FeedConfigService } from './feed-config.service';
import { FeedRunnerService } from './feed-runner.service';
import { FeedConfig } from './feeds.config';

@Injectable()
export class FeedsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedsScheduler.name);
  private readonly jobs = new Map<string, CronJob>();

  constructor(
    private readonly config: ConfigService,
    private readonly feedConfig: FeedConfigService,
    private readonly runner: FeedRunnerService,
  ) {}

  onModuleInit() {
    const tz = this.config.get<string>('APP_TIMEZONE') ?? process.env.APP_TIMEZONE;

    const feeds = this.feedConfig.getAllFeeds().filter((f) => f.enabled);
    if (!feeds.length) {
      this.logger.warn('No enabled feeds found.');
      return;
    }

    for (const feed of feeds) {
      this.registerFeed(feed, tz);
    }

    this.logger.log(`Feeds scheduler started: enabled=${feeds.length}`);
  }

  onModuleDestroy() {
    for (const job of this.jobs.values()) job.stop();
    this.jobs.clear();
  }

  private registerFeed(feed: FeedConfig, tz?: string) {
    const key = `${feed.type}:${feed.id}`;

    const job = new CronJob(
      feed.schedule,
      async () => {
        try {
          await this.runner.runFeed(feed.id, feed.type);
        } catch (e: any) {
          this.logger.error(`Feed run failed (${key}): ${e?.message ?? e}`);
        }
      },
      null,
      false,
      tz,
    );

    job.start();
    this.jobs.set(key, job);

    this.logger.log(`Registered feed ${key} schedule="${feed.schedule}" tz="${tz ?? 'default'}"`);
  }
}