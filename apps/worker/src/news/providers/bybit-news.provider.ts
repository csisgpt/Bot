import { ConfigService } from '@nestjs/config';
import { NewsProvider, NewsItem } from '@libs/market-data';
import { createNewsHttp, retry } from '../news-fetcher.util';
import { parseNewsLinks } from '../news-parser';
import { hashNewsItem } from '@libs/market-data';

export class BybitNewsProvider implements NewsProvider {
  readonly provider = 'bybit';
  private readonly http;
  private readonly baseUrl: string;
  private readonly fallbackUrls: string[];
  private readonly retryAttempts: number;
  private readonly retryBaseDelayMs: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = configService.get<string>(
      'NEWS_BYBIT_URL',
      'https://www.bybit.com/en/announcement-info',
    );
    this.fallbackUrls = [
      'https://www.bybit.com/en/announcement-info',
      'https://www.bybit.com/en/support/announcements',
    ].filter((url, index, list) => list.indexOf(url) === index);
    this.http = createNewsHttp(this.baseUrl, configService.get<number>('NEWS_HTTP_TIMEOUT_MS', 10000));
    this.retryAttempts = configService.get<number>('NEWS_RETRY_ATTEMPTS', 3);
    this.retryBaseDelayMs = configService.get<number>('NEWS_RETRY_BASE_DELAY_MS', 500);
  }

  async fetchLatest(): Promise<NewsItem[]> {
    const urls = [this.baseUrl, ...this.fallbackUrls];
    let links: { title: string; url: string }[] = [];

    for (const url of urls) {
      const response = await retry(
        () => this.http.get(url),
        this.retryAttempts,
        this.retryBaseDelayMs,
      );
      if (response.status >= 400) {
        continue;
      }
      const html = response.data as string;
      links = parseNewsLinks(html, url);
      if (links.length > 0) {
        break;
      }
    }
    const now = Date.now();

    return links.slice(0, 20).map((link) => ({
      provider: this.provider,
      ts: now,
      title: link.title,
      url: link.url,
      category: 'اعلان',
      tags: [],
      hash: hashNewsItem({ provider: this.provider, title: link.title, url: link.url }),
    }));
  }

  normalize(items: NewsItem[]): NewsItem[] {
    return items.map((item) => ({
      ...item,
      title: item.title.trim(),
    }));
  }

  dedupe(items: NewsItem[]): NewsItem[] {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.hash)) {
        return false;
      }
      seen.add(item.hash);
      return true;
    });
  }
}
