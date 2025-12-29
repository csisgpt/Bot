import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const filesToCheck = [
  'apps/api/src/telegram/fa.messages.ts',
  'apps/api/src/telegram/telegram-bot.service.ts',
  'apps/worker/src/cron/digest.cron.ts',
  'apps/worker/src/notifications/formatting/message-formatter.service.ts',
  'libs/telegram/src/telegram.formatter.ts',
  'docs/pr4-1-notifications.md',
];

describe('Persian strings sanity', () => {
  it('does not contain form feed or \\u000c sequences', () => {
    for (const file of filesToCheck) {
      const fullPath = path.join(process.cwd(), file);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content.includes('\f')).toBe(false);
      expect(/\\u000c/.test(content)).toBe(false);
    }
  });
});
