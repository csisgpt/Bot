import axios, { AxiosInstance } from 'axios';

export const createProviderHttp = (baseURL: string, timeout: number): AxiosInstance =>
  axios.create({
    baseURL,
    timeout,
    headers: { 'User-Agent': 'worker-market-data/1.0' },
  });

export const retry = async <T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 300,
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
