import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { NewsProvider, NewsItem } from '@libs/market-data';
import { createNewsHttp, retry } from '../news-fetcher.util';
import { parseNewsLinks } from '../news-parser';
import { hashNewsItem } from '@libs/market-data';

export class OkxNewsProvider implements NewsProvider {
  readonly provider = 'okx';
  private readonly logger = new Logger(OkxNewsProvider.name);
  private readonly http;
  private readonly rssHttp;
  private readonly baseUrl: string;
  private readonly rssUrls: string[];
  private readonly fallbackUrls: string[];
  private readonly retryAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = configService.get<string>(
      'NEWS_OKX_URL',
      'https://www.okx.com/support/hc/en-us/categories/360000030652',
    );
    this.rssUrls = [
      'https://www.okx.com/support/hc/en-us/sections/360000033031?format=atom',
      'https://www.okx.com/support/hc/en-us/categories/360000030652?format=atom',
    ];
    this.fallbackUrls = [
      'https://www.okx.com/support/hc/en-us/categories/360000030652',
      'https://www.okx.com/support/hc/en-us/sections/360000033031',
    ].filter((url, index, list) => list.indexOf(url) === index);
    this.timeoutMs = configService.get<number>('NEWS_HTTP_TIMEOUT_MS', 10000);
    this.http = createNewsHttp(this.baseUrl, this.timeoutMs);
    this.rssHttp = createNewsHttp(this.baseUrl, this.timeoutMs, {
      Accept: 'application/xml,text/xml,application/atom+xml',
    });
    this.retryAttempts = configService.get<number>('NEWS_RETRY_ATTEMPTS', 3);
    this.retryBaseDelayMs = configService.get<number>('NEWS_RETRY_BASE_DELAY_MS', 500);
  }

  async fetchLatest(): Promise<NewsItem[]> {
    const rssLinks = await this.fetchFromRss();
    if (rssLinks.length > 0) {
      return this.buildItems(rssLinks);
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

  private async fetchFromRss(): Promise<Array<{ title: string; url: string }>> {
    for (const url of this.rssUrls) {
      try {
        const response = await retry(
          () => this.rssHttp.get(url),
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
        const xml = response.data as string;
        const links = this.parseRssLinks(xml, url);
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

  private parseRssLinks(xml: string, baseUrl: string): Array<{ title: string; url: string }> {
    const links: Array<{ title: string; url: string }> = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const extract = (block: string) => {
      const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
      const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
      const linkTextMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      const href = linkMatch?.[1] ?? linkTextMatch?.[1] ?? '';
      if (!title || !href) {
        return;
      }
      try {
        const resolved = new URL(href.trim(), baseUrl);
        links.push({ title, url: resolved.toString() });
      } catch (error) {
        return;
      }
    };

    let match: RegExpExecArray | null;
    while ((match = entryRegex.exec(xml))) {
      extract(match[1]);
    }
    while ((match = itemRegex.exec(xml))) {
      extract(match[1]);
    }
    return links;
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
