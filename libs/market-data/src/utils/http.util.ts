import axios, { AxiosInstance } from 'axios';

export const createHttpClient = (baseURL: string, timeoutMs: number): AxiosInstance =>
  axios.create({
    baseURL,
    timeout: timeoutMs,
    headers: { 'User-Agent': 'market-data-bot/1.0' },
  });
