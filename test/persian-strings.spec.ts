import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const filesToCheck = [
  'apps/api/src/telegram/fa.messages.ts',
  'apps/api/src/telegram/telegram-bot.service.ts',
  'apps/worker/src/cron/digest.cron.ts',
  'apps/worker/src/cron/digest.utils.ts',
  'apps/worker/src/notifications/formatting/message-formatter.service.ts',
  'libs/telegram/src/telegram.formatter.ts',
  'libs/telegram/src/telegram.service.ts',
  'docs/pr4-1-notifications.md',
];

const directoriesToCheck = ['libs/signals/src/strategies'];

const collectFiles = (dir: string): string[] => {
  const base = path.join(process.cwd(), dir);
  const entries = fs.readdirSync(base, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const full = path.join(base, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(path.join(dir, entry.name)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      results.push(full);
    }
  }

  return results;
};

describe('Persian strings sanity', () => {
  it('does not contain form feed or u000c sequences', () => {
    const formFeed = String.fromCharCode(12);
    const escapedSequence = '\\\\u' + '000c';
    const escapedRegex = new RegExp(escapedSequence);

    const extraFiles = directoriesToCheck.flatMap((dir) => collectFiles(dir));
    const allFiles = [...filesToCheck.map((file) => path.join(process.cwd(), file)), ...extraFiles];

    for (const fullPath of allFiles) {
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content.includes(formFeed)).toBe(false);
      expect(escapedRegex.test(content)).toBe(false);
    }
  });
});
