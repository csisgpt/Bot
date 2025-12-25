import { describe, expect, it } from 'vitest';
import { envSchema } from '@libs/core';
import fs from 'fs';
import path from 'path';

const readEnvExampleKeys = (): Set<string> => {
  const envPath = path.join(process.cwd(), '.env.example');
  const content = fs.readFileSync(envPath, 'utf8');
  const keys = new Set<string>();

  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const match = trimmed.match(/^([A-Z0-9_]+)=/);
    if (match) {
      keys.add(match[1]);
    }
  });

  return keys;
};

describe('.env.example alignment', () => {
  it('includes all env.schema keys', () => {
    const envKeys = readEnvExampleKeys();
    const schemaKeys = Object.keys(envSchema.shape);
    const missing = schemaKeys.filter((key) => !envKeys.has(key));

    expect(missing).toEqual([]);
  });
});
