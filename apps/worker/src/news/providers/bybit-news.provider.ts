import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { NewsProvider, NewsItem } from '@libs/market-data';
import { createNewsHttp, retry } from '../news-fetcher.util';
import { parseNewsLinks } from '../news-parser';
import { hashNewsItem } from '@libs/market-data';

export class BybitNewsProvider implements NewsProvider {
  readonly provider = 'bybit';
  private readonly logger = new Logger(BybitNewsProvider.name);
  private readonly http;
  private readonly jsonHttp;
  private readonly baseUrl: string;
  private readonly fallbackUrls: string[];
  private readonly apiEndpoints: string[];
  private readonly retryAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = configService.get<string>(
      'NEWS_BYBIT_URL',
      'https://www.bybit.com/en/announcement-info',
    );
    this.apiEndpoints = [
      'https://api.bybit.com/v5/announcements/index?locale=en-US&category=all',
    ];
    this.fallbackUrls = [
      'https://www.bybit.com/en/announcement-info',
      'https://www.bybit.com/en/support/announcements',
    ].filter((url, index, list) => list.indexOf(url) === index);
    this.timeoutMs = configService.get<number>('NEWS_HTTP_TIMEOUT_MS', 10000);
    this.http = createNewsHttp(this.baseUrl, this.timeoutMs);
    this.jsonHttp = createNewsHttp('https://api.bybit.com', this.timeoutMs, {
      Accept: 'application/json',
    });
    this.retryAttempts = configService.get<number>('NEWS_RETRY_ATTEMPTS', 3);
    this.retryBaseDelayMs = configService.get<number>('NEWS_RETRY_BASE_DELAY_MS', 500);
  }

  async fetchLatest(): Promise<NewsItem[]> {
    const apiLinks = await this.fetchFromApi();
    if (apiLinks.length > 0) {
      return this.buildItems(apiLinks);
    }

    const urls = [this.baseUrl, ...this.fallbackUrls];
    let links: { title: string; url: string }[] = [];

    for (const url of urls) {
      try {
        const response = await retry(
          () => this.http.get(url),
          this.retryAttempts,
          this.retryBaseDelayMs,
        );
        if (response.status >= 400) {
          this.logger.warn(
            JSON.stringify({
              event: 'news_fetch_http_error',
              provider: this.provider,
              url,
              status: response.status,
              timeoutMs: this.timeoutMs,
            }),
          );
          continue;
        }
        const html = response.data as string;
        links = parseNewsLinks(html, url);
        if (links.length > 0) {
          break;
        }
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            event: 'news_fetch_http_error',
            provider: this.provider,
            url,
            timeoutMs: this.timeoutMs,
            message: error instanceof Error ? error.message : 'Unknown error',
          }),
        );
      }
    }

    return this.buildItems(links);
  }

  private async fetchFromApi(): Promise<Array<{ title: string; url: string }>> {
    for (const url of this.apiEndpoints) {
      try {
        const response = await retry(
          () => this.jsonHttp.get(url),
          this.retryAttempts,
          this.retryBaseDelayMs,
        );
        if (response.status >= 400) {
          this.logger.warn(
            JSON.stringify({
              event: 'news_fetch_http_error',
              provider: this.provider,
              url,
              status: response.status,
              timeoutMs: this.timeoutMs,
            }),
          );
          continue;
        }
        const list = response.data?.result?.list ?? response.data?.result?.data?.list ?? [];
        const links = (list as Array<Record<string, string>>)
          .map((item) => this.toLink(item))
          .filter((link): link is { title: string; url: string } => Boolean(link));
        if (links.length > 0) {
          return links;
        }
      } catch (error) {
        this.logger.warn(
          JSON.stringify({
            event: 'news_fetch_http_error',
            provider: this.provider,
            url,
            timeoutMs: this.timeoutMs,
            message: error instanceof Error ? error.message : 'Unknown error',
          }),
        );
      }
    }
    return [];
  }

  private toLink(item: Record<string, string>): { title: string; url: string } | null {
    const title = String(item.title ?? item.subject ?? '').trim();
    const urlRaw = String(item.url ?? item.link ?? '').trim();
    if (!title || !urlRaw) {
      return null;
    }
    try {
      const resolved = new URL(urlRaw, this.baseUrl);
      return { title, url: resolved.toString() };
    } catch (error) {
      return null;
    }
  }

  private buildItems(links: { title: string; url: string }[]): NewsItem[] {
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
