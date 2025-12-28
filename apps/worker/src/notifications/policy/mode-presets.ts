export type NotificationMode = 'NORMAL' | 'FOCUS' | 'SLEEP' | 'SCALP';

export interface ModePreset {
  maxNotifsPerHour?: number;
  minConfidence?: number;
  cooldownMultiplier?: number;
}

const MODE_PRESETS: Record<NotificationMode, ModePreset> = {
  NORMAL: {
    maxNotifsPerHour: 12,
    minConfidence: 60,
    cooldownMultiplier: 1,
  },
  FOCUS: {
    maxNotifsPerHour: 6,
    minConfidence: 80,
    cooldownMultiplier: 2,
  },
  SLEEP: {
    maxNotifsPerHour: 2,
    minConfidence: 90,
    cooldownMultiplier: 4,
  },
  SCALP: {
    maxNotifsPerHour: 6,
    minConfidence: 50,
    cooldownMultiplier: 1,
  },
};

export const normalizeMode = (mode?: string | null): NotificationMode => {
  if (!mode) return 'NORMAL';
  const normalized = mode.toUpperCase();
  if (normalized === 'QUIET') return 'SLEEP';
  if (normalized === 'AGGRESSIVE') return 'SCALP';
  if (normalized === 'FOCUS' || normalized === 'SLEEP' || normalized === 'SCALP') {
    return normalized as NotificationMode;
  }
  return 'NORMAL';
};

export const getModePreset = (mode?: string | null): ModePreset => {
  const normalized = normalizeMode(mode);
  return MODE_PRESETS[normalized] ?? MODE_PRESETS.NORMAL;
};
