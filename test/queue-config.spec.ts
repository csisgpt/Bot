import { describe, expect, it, vi } from 'vitest';

describe('queue config', () => {
  it('reads queue concurrency from env', async () => {
    process.env.QUEUE_CONCURRENCY = '7';
    vi.resetModules();
    const { SIGNALS_QUEUE_CONCURRENCY } = await import('@libs/core');
    expect(SIGNALS_QUEUE_CONCURRENCY).toBe(7);
    delete process.env.QUEUE_CONCURRENCY;
  });
});
