export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
}

export const retry = async <T>(
  fn: () => Promise<T>,
  { attempts, baseDelayMs, maxDelayMs = 30_000 }: RetryOptions,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
};
