import { Module } from '@nestjs/common';
import { FeedConfigService } from './feed-config.service';
import { FeedRunnerService } from './feed-runner.service';
import { FeedsSchedulerService } from './feeds.scheduler';

@Module({
  providers: [FeedConfigService, FeedRunnerService, FeedsSchedulerService],
})
export class FeedsModule {}