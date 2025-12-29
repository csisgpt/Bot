import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = process.cwd();
const directoriesToCheck = ['apps', 'libs', 'docs'];
const skipDirs = new Set(['node_modules', 'dist', '.git']);
const textExtensions = new Set([
  '.ts',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.env',
  '.sh',
  '.txt',
]);

const isTextFile = (filePath: string): boolean => {
  const base = path.basename(filePath);
  if (base.startsWith('.env')) {
    return true;
  }
  if (base === 'Dockerfile') {
    return true;
  }
  const ext = path.extname(base);
  return textExtensions.has(ext);
};

const collectFiles = (dir: string): string[] => {
  const absolute = path.join(root, dir);
  const entries = fs.readdirSync(absolute, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const relative = path.join(dir, entry.name);
    const full = path.join(root, relative);

    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) {
        continue;
      }
      results.push(...collectFiles(relative));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (isTextFile(full)) {
      results.push(full);
    }
  }

  return results;
};

describe('Repository control characters guard', () => {
  it('does not contain form feed or \\u000c sequences', () => {
    const formFeed = String.fromCharCode(12);
    const files = directoriesToCheck.flatMap((dir) => collectFiles(dir));

    for (const filePath of files) {
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content.includes(formFeed)).toBe(false);
      expect(content.includes('\\u000c')).toBe(false);
    }
  });
});
