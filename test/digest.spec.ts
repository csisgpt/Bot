import { describe, expect, it } from 'vitest';
import { NotificationOrchestratorService } from '../apps/worker/src/notifications/notification-orchestrator.service';
import { truncateDigestMessage } from '../apps/worker/src/cron/digest.utils';

const buildOrchestratorWithRedis = (redisService: any) => {
  const configService = {
    get: (key: string, fallback?: unknown) => {
      if (key === 'APP_TIMEZONE') return 'Europe/Berlin';
      return fallback;
    },
  } as never;

  return new NotificationOrchestratorService(
    configService,
    {} as never,
    redisService,
    { findExisting: async () => null, createDelivery: async () => null } as never,
    { formatNews: () => '', formatArbitrage: () => '', formatSignal: () => '' } as never,
    { add: async () => undefined } as never,
  );
};

describe('digest helpers', () => {
  it('caps digest buffer length', async () => {
    const lists = new Map<string, string[]>();
    const redisService = {
      rpush: async (key: string, value: string) => {
        const list = lists.get(key) ?? [];
        list.push(value);
        lists.set(key, list);
      },
      ltrim: async (key: string, start: number, stop: number) => {
        const list = lists.get(key) ?? [];
        const size = list.length;
        const normalizedStart = start < 0 ? Math.max(0, size + start) : start;
        const normalizedStop = stop < 0 ? size + stop + 1 : stop + 1;
        lists.set(key, list.slice(normalizedStart, normalizedStop));
      },
      expire: async () => undefined,
    } as never;

    const orchestrator = buildOrchestratorWithRedis(redisService) as any;

    for (let i = 0; i < 250; i += 1) {
      await orchestrator.bufferDigest('SIGNAL', `sig-${i}`, 'chat-1');
    }

    const entries = Array.from(lists.values());
    expect(entries.length).toBe(1);
    expect(entries[0].length).toBeLessThanOrEqual(200);
  });

  it('truncates long digest messages safely', () => {
    const longMessage = `<b>خلاصه</b>${'الف'.repeat(5000)}`;
    const truncated = truncateDigestMessage(longMessage);

    expect(truncated.length).toBeLessThanOrEqual(3800);
    expect(truncated.includes('<')).toBe(false);
    expect(truncated.endsWith('…')).toBe(true);
  });
});
