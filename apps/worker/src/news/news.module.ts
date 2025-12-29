import { Module } from '@nestjs/common';
import { CoreModule } from '@libs/core';
import { NewsFetcherService } from './news-fetcher.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [CoreModule, NotificationsModule],
  providers: [NewsFetcherService],
  exports: [NewsFetcherService],
})
export class NewsModule {}
