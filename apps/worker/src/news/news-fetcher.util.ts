import axios, { AxiosInstance } from 'axios';

export const createNewsHttp = (baseURL: string, timeoutMs: number): AxiosInstance =>
  axios.create({
    baseURL,
    timeout: timeoutMs,
    headers: { 'User-Agent': 'market-news-bot/1.0' },
  });

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
