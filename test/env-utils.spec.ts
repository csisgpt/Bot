import { describe, expect, it } from 'vitest';
import { booleanFromEnv, numberFromEnv } from '@libs/core';

describe('env parsing helpers', () => {
  it('parses boolean-like strings', () => {
    expect(booleanFromEnv('true')).toBe(true);
    expect(booleanFromEnv(' false ')).toBe(false);
    expect(booleanFromEnv("'true'")).toBe(true);
    expect(booleanFromEnv('false)')).toBe(false);
    expect(booleanFromEnv('(1)')).toBe(true);
    expect(booleanFromEnv('0')).toBe(false);
    expect(booleanFromEnv('yes')).toBe('yes');
    expect(booleanFromEnv('no')).toBe('no');
  });

  it('parses numbers with trimming', () => {
    expect(numberFromEnv('42')).toBe(42);
    expect(numberFromEnv('  3.14 ')).toBe(3.14);
    expect(numberFromEnv('"7"')).toBe(7);
    expect(numberFromEnv('(10)')).toBe(10);
    expect(numberFromEnv('')).toBeUndefined();
  });
});
