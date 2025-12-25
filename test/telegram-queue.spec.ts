import { describe, expect, it } from 'vitest';
import { telegramTextJobSchema } from '@libs/telegram';

describe('telegram text job schema', () => {
  it('accepts valid payloads', () => {
    const payload = telegramTextJobSchema.parse({
      chatId: '12345',
      text: 'hello',
      parseMode: 'HTML',
    });

    expect(payload).toEqual({ chatId: '12345', text: 'hello', parseMode: 'HTML' });
  });

  it('rejects empty text payloads', () => {
    const result = telegramTextJobSchema.safeParse({ chatId: '12345', text: '' });
    expect(result.success).toBe(false);
  });
});
