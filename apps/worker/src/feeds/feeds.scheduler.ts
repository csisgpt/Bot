// apps/worker/src/feeds/feeds.scheduler.ts

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeedConfigService } from './feed-config.service';
import { FeedRunnerService } from './feed-runner.service';
import { FeedConfig } from './feeds.config';

@Injectable()
export class FeedsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedsScheduler.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

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
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }

  private registerFeed(feed: FeedConfig, tz?: string) {
    const key = `${feed.type}:${feed.id}`;
    const intervalMs = Math.max(feed.intervalSec, 1) * 1000;
    const timer = setInterval(async () => {
      try {
        await this.runner.runFeed(feed.id, feed.type);
      } catch (e: any) {
        this.logger.error(`Feed run failed (${key}): ${e?.message ?? e}`);
      }
    }, intervalMs);

    this.timers.set(key, timer);

    this.logger.log(
      `Registered feed ${key} intervalSec=${feed.intervalSec} tz="${tz ?? 'default'}"`,
    );
  }
}
