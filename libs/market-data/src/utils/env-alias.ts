const cleanEnvValue = (value?: string): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : undefined;
};

export const getEnvFirst = (...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = cleanEnvValue(process.env[key]);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
};

export const getEnvFirstInt = (defaultValue: number, ...keys: string[]): number => {
  const raw = getEnvFirst(...keys);
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

export const getEnvFirstBool = (defaultValue: boolean, ...keys: string[]): boolean => {
  const raw = getEnvFirst(...keys);
  if (!raw) return defaultValue;
  const normalized = raw.toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return defaultValue;
};
