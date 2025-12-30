import axios, { AxiosInstance } from 'axios';

const defaultHeaders = {
  'User-Agent':
    'Mozilla/5.0 (compatible; market-news-bot/1.0; +https://example.com/bot)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.8',
};

export const createNewsHttp = (baseURL: string, timeoutMs: number): AxiosInstance =>
  axios.create({
    baseURL,
    timeout: timeoutMs,
    headers: defaultHeaders,
    maxRedirects: 3,
    validateStatus: (status) => status >= 200 && status < 500,
  });

export const normalizeNewsUrl = (value: string): string => value.trim();

export const retry = async <T>(
  fn: () => Promise<T>,
  attempts: number,
  baseDelayMs: number,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const delay = baseDelayMs * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
};
