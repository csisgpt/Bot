import { Module } from '@nestjs/common';
import { CoreModule } from '@libs/core';
import { NewsFetcherService } from './news-fetcher.service';

@Module({
  imports: [CoreModule],
  providers: [NewsFetcherService],
  exports: [NewsFetcherService],
})
export class NewsModule {}
