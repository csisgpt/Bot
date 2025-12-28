import { DateTime } from 'luxon';
import { getModePreset, normalizeMode } from './mode-presets';

export type NotificationEntityType = 'SIGNAL' | 'NEWS' | 'ARB';

export interface EnabledFeatures {
  signals?: boolean;
  news?: boolean;
  arbitrage?: boolean;
}

export interface ChatPreferences {
  chatId: string;
  mode?: string | null;
  watchlist: string[];
  enabledProviders: string[];
  enabledFeatures: EnabledFeatures;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  maxNotifsPerHour: number;
  cooldownSignalsSec: number;
  cooldownNewsSec: number;
  cooldownArbSec: number;
  minConfidence: number;
  digestEnabled: boolean;
  digestTimes: string[];
  assetsEnabled?: string[];
  timeframes?: string[];
  mutedUntil?: Date | null;
  mutedInstruments?: string[];
}

export interface SignalSnapshot {
  assetType: string;
  instrument: string;
  interval: string;
  strategy: string;
  confidence: number;
  source?: string | null;
}

export interface NewsSnapshot {
  provider: string;
  title: string;
  category: string;
  tags: string[];
  url: string;
}

export interface ArbSnapshot {
  canonicalSymbol: string;
  buyExchange: string;
  sellExchange: string;
  netPct?: number | null;
  confidence: number;
}

export interface PolicyInput {
  entityType: NotificationEntityType;
  preferences: ChatPreferences;
  now: Date;
  timeZone: string;
  signal?: SignalSnapshot;
  news?: NewsSnapshot;
  arb?: ArbSnapshot;
  rateLimitHit: boolean;
  cooldownHit: boolean;
}

export type PolicyAction = 'ALLOW' | 'SKIP' | 'DIGEST';

export interface PolicyDecision {
  action: PolicyAction;
  reason?: string;
}

const normalizeList = (items: string[] = []): string[] =>
  items.map((item) => item.trim().toUpperCase()).filter(Boolean);

const normalizeProviders = (items: string[] = []): string[] =>
  items.map((item) => item.trim().toLowerCase()).filter(Boolean);

const toLocalMinutes = (now: Date, timeZone: string): number | null => {
  const zoned = DateTime.fromJSDate(now, { zone: timeZone });
  const safe = zoned.isValid ? zoned : DateTime.fromJSDate(now, { zone: 'UTC' });
  if (!safe.isValid) return null;
  return safe.hour * 60 + safe.minute;
};

export const isInQuietHours = (now: Date, start: string, end: string, timeZone: string): boolean => {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  if ([startH, startM, endH, endM].some((v) => Number.isNaN(v))) return false;

  const minutes = toLocalMinutes(now, timeZone);
  if (minutes === null) return false;

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) {
    return minutes >= startMinutes && minutes < endMinutes;
  }
  return minutes >= startMinutes || minutes < endMinutes;
};

const isHighImpactNews = (news: NewsSnapshot): boolean => {
  const title = `${news.title} ${news.category}`.toLowerCase();
  const tags = news.tags.map((tag) => tag.toLowerCase());
  if (tags.includes('high') || tags.includes('urgent')) return true;
  if (title.includes('announcement') || title.includes('اطلاعیه')) return true;
  return false;
};

const matchesWatchlist = (watchlist: string[], text: string): boolean => {
  if (watchlist.length === 0) return true;
  const haystack = text.toUpperCase();
  return watchlist.some((item) => haystack.includes(item));
};

const matchesProviders = (enabledProviders: string[], provider: string): boolean => {
  if (enabledProviders.length === 0) return true;
  return enabledProviders.includes(provider.toLowerCase());
};

const isHighPriority = (
  entityType: NotificationEntityType,
  signal?: SignalSnapshot,
  news?: NewsSnapshot,
  arb?: ArbSnapshot,
): boolean => {
  if (entityType === 'SIGNAL' && signal) {
    return signal.confidence >= 85;
  }
  if (entityType === 'NEWS' && news) {
    return isHighImpactNews(news);
  }
  if (entityType === 'ARB' && arb) {
    return (arb.netPct ?? 0) >= 0.5;
  }
  return false;
};

export const evaluatePolicy = (input: PolicyInput): PolicyDecision => {
  const { entityType, preferences, now, timeZone, signal, news, arb, rateLimitHit, cooldownHit } = input;
  const features = preferences.enabledFeatures ?? {};
  const modePreset = getModePreset(preferences.mode);

  const effectiveMaxPerHour = modePreset.maxNotifsPerHour ?? preferences.maxNotifsPerHour;
  const effectiveMinConfidence = modePreset.minConfidence ?? preferences.minConfidence;

  const highPriority = isHighPriority(entityType, signal, news, arb);
  if (preferences.digestEnabled && !highPriority) {
    return { action: 'DIGEST', reason: 'digest_buffered' };
  }

  if (entityType === 'SIGNAL' && features.signals === false) {
    return { action: 'SKIP', reason: 'feature_disabled' };
  }
  if (entityType === 'NEWS' && features.news === false) {
    return { action: 'SKIP', reason: 'feature_disabled' };
  }
  if (entityType === 'ARB' && features.arbitrage === false) {
    return { action: 'SKIP', reason: 'feature_disabled' };
  }

  if (entityType === 'SIGNAL' && signal) {
    const assetsEnabled = normalizeList(preferences.assetsEnabled ?? []);
    if (assetsEnabled.length > 0 && !assetsEnabled.includes(signal.assetType.toUpperCase())) {
      return { action: 'SKIP', reason: 'asset_filtered' };
    }

    const timeframes = (preferences.timeframes ?? []).map((frame) => frame.toLowerCase());
    if (timeframes.length > 0 && !timeframes.includes(signal.interval.toLowerCase())) {
      return { action: 'SKIP', reason: 'timeframe_filtered' };
    }

    const watchlist = normalizeList(preferences.watchlist ?? []);
    if (!matchesWatchlist(watchlist, signal.instrument)) {
      return { action: 'SKIP', reason: 'watchlist_filtered' };
    }

    if (signal.confidence < effectiveMinConfidence) {
      return { action: 'SKIP', reason: 'min_confidence' };
    }

    if (preferences.mutedUntil && now < preferences.mutedUntil) {
      const muted = preferences.mutedInstruments ?? [];
      if (muted.length === 0 || muted.includes(signal.instrument)) {
        return { action: 'SKIP', reason: 'muted' };
      }
    }

    const providers = normalizeProviders(preferences.enabledProviders ?? []);
    if (!matchesProviders(providers, signal.source ?? '')) {
      return { action: 'SKIP', reason: 'provider_filtered' };
    }

    if (
      preferences.quietHoursEnabled &&
      isInQuietHours(now, preferences.quietHoursStart, preferences.quietHoursEnd, timeZone)
    ) {
      if (signal.confidence < 85) {
        return { action: 'SKIP', reason: 'quiet_hours' };
      }
    }
  }

  if (entityType === 'NEWS' && news) {
    const watchlist = normalizeList(preferences.watchlist ?? []);
    const haystack = `${news.title} ${news.category} ${news.tags.join(' ')}`;
    if (!matchesWatchlist(watchlist, haystack)) {
      return { action: 'SKIP', reason: 'watchlist_filtered' };
    }

    const providers = normalizeProviders(preferences.enabledProviders ?? []);
    if (!matchesProviders(providers, news.provider)) {
      return { action: 'SKIP', reason: 'provider_filtered' };
    }

    if (
      preferences.quietHoursEnabled &&
      isInQuietHours(now, preferences.quietHoursStart, preferences.quietHoursEnd, timeZone)
    ) {
      if (!isHighImpactNews(news)) {
        return { action: 'SKIP', reason: 'quiet_hours' };
      }
    }
  }

  if (entityType === 'ARB' && arb) {
    const watchlist = normalizeList(preferences.watchlist ?? []);
    if (!matchesWatchlist(watchlist, arb.canonicalSymbol)) {
      return { action: 'SKIP', reason: 'watchlist_filtered' };
    }

    const providers = normalizeProviders(preferences.enabledProviders ?? []);
    const providerAllowed =
      providers.length === 0 ||
      providers.includes(arb.buyExchange.toLowerCase()) ||
      providers.includes(arb.sellExchange.toLowerCase());
    if (!providerAllowed) {
      return { action: 'SKIP', reason: 'provider_filtered' };
    }

    if (arb.confidence < effectiveMinConfidence) {
      return { action: 'SKIP', reason: 'min_confidence' };
    }

    if (
      preferences.quietHoursEnabled &&
      isInQuietHours(now, preferences.quietHoursStart, preferences.quietHoursEnd, timeZone)
    ) {
      const netPct = arb.netPct ?? 0;
      if (netPct < 0.5) {
        return { action: 'SKIP', reason: 'quiet_hours' };
      }
    }
  }

  if (rateLimitHit) {
    return { action: 'SKIP', reason: 'rate_limit' };
  }

  if (cooldownHit) {
    return { action: 'SKIP', reason: 'cooldown' };
  }

  if (effectiveMaxPerHour <= 0) {
    return { action: 'SKIP', reason: 'max_per_hour_zero' };
  }

  return { action: 'ALLOW' };
};

export const resolveEffectiveMode = (mode?: string | null): string => normalizeMode(mode);
