export type NotificationMode = 'NORMAL' | 'QUIET' | 'AGGRESSIVE';

export interface ModePreset {
  maxNotifsPerHour?: number;
  minConfidence?: number;
}

const MODE_PRESETS: Record<NotificationMode, ModePreset> = {
  NORMAL: {},
  QUIET: {
    maxNotifsPerHour: 4,
    minConfidence: 80,
  },
  AGGRESSIVE: {
    maxNotifsPerHour: 24,
    minConfidence: 50,
  },
};

export const getModePreset = (mode?: string | null): ModePreset => {
  if (!mode) return MODE_PRESETS.NORMAL;
  return MODE_PRESETS[(mode.toUpperCase() as NotificationMode) ?? 'NORMAL'] ?? MODE_PRESETS.NORMAL;
};
