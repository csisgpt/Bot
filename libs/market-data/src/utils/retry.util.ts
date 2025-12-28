export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
}

export const retry = async <T>(
  fn: () => Promise<T>,
  { attempts, baseDelayMs, maxDelayMs = 30_000, shouldRetry }: RetryOptions,
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const allowRetry =
        attempt < attempts && (shouldRetry ? shouldRetry(error) : true);
      if (!allowRetry) {
        throw error;
      }
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
};
