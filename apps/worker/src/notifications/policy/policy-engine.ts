import { getModePreset } from './mode-presets';

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
  signal?: SignalSnapshot;
  news?: NewsSnapshot;
  arb?: ArbSnapshot;
  rateLimitHit: boolean;
  cooldownHit: boolean;
}

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}

const normalizeList = (items: string[] = []): string[] =>
  items.map((item) => item.trim().toUpperCase()).filter(Boolean);

const normalizeProviders = (items: string[] = []): string[] =>
  items.map((item) => item.trim().toLowerCase()).filter(Boolean);

export const isInQuietHours = (now: Date, start: string, end: string): boolean => {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  if ([startH, startM, endH, endM].some((v) => Number.isNaN(v))) return false;

  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
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

export const evaluatePolicy = (input: PolicyInput): PolicyDecision => {
  const { entityType, preferences, now, signal, news, arb, rateLimitHit, cooldownHit } = input;
  const features = preferences.enabledFeatures ?? {};

  const modePreset = getModePreset(preferences.mode);
  const effectiveMaxPerHour = modePreset.maxNotifsPerHour ?? preferences.maxNotifsPerHour;
  const effectiveMinConfidence = modePreset.minConfidence ?? preferences.minConfidence;

  if (preferences.digestEnabled) {
    return { allowed: false, reason: 'digest_enabled' };
  }

  if (entityType === 'SIGNAL' && features.signals === false) {
    return { allowed: false, reason: 'feature_disabled' };
  }
  if (entityType === 'NEWS' && features.news === false) {
    return { allowed: false, reason: 'feature_disabled' };
  }
  if (entityType === 'ARB' && features.arbitrage === false) {
    return { allowed: false, reason: 'feature_disabled' };
  }

  if (entityType === 'SIGNAL' && signal) {
    const assetsEnabled = normalizeList(preferences.assetsEnabled ?? []);
    if (assetsEnabled.length > 0 && !assetsEnabled.includes(signal.assetType.toUpperCase())) {
      return { allowed: false, reason: 'asset_filtered' };
    }

    const timeframes = (preferences.timeframes ?? []).map((frame) => frame.toLowerCase());
    if (timeframes.length > 0 && !timeframes.includes(signal.interval.toLowerCase())) {
      return { allowed: false, reason: 'timeframe_filtered' };
    }

    const watchlist = normalizeList(preferences.watchlist ?? []);
    if (!matchesWatchlist(watchlist, signal.instrument)) {
      return { allowed: false, reason: 'watchlist_filtered' };
    }

    if (signal.confidence < effectiveMinConfidence) {
      return { allowed: false, reason: 'min_confidence' };
    }

    if (preferences.mutedUntil && now < preferences.mutedUntil) {
      const muted = preferences.mutedInstruments ?? [];
      if (muted.length === 0 || muted.includes(signal.instrument)) {
        return { allowed: false, reason: 'muted' };
      }
    }

    const providers = normalizeProviders(preferences.enabledProviders ?? []);
    if (!matchesProviders(providers, signal.source ?? '')) {
      return { allowed: false, reason: 'provider_filtered' };
    }

    if (preferences.quietHoursEnabled && isInQuietHours(now, preferences.quietHoursStart, preferences.quietHoursEnd)) {
      if (signal.confidence < 85) {
        return { allowed: false, reason: 'quiet_hours' };
      }
    }
  }

  if (entityType === 'NEWS' && news) {
    const watchlist = normalizeList(preferences.watchlist ?? []);
    const haystack = `${news.title} ${news.category} ${news.tags.join(' ')}`;
    if (!matchesWatchlist(watchlist, haystack)) {
      return { allowed: false, reason: 'watchlist_filtered' };
    }

    const providers = normalizeProviders(preferences.enabledProviders ?? []);
    if (!matchesProviders(providers, news.provider)) {
      return { allowed: false, reason: 'provider_filtered' };
    }

    if (preferences.quietHoursEnabled && isInQuietHours(now, preferences.quietHoursStart, preferences.quietHoursEnd)) {
      if (!isHighImpactNews(news)) {
        return { allowed: false, reason: 'quiet_hours' };
      }
    }
  }

  if (entityType === 'ARB' && arb) {
    const watchlist = normalizeList(preferences.watchlist ?? []);
    if (!matchesWatchlist(watchlist, arb.canonicalSymbol)) {
      return { allowed: false, reason: 'watchlist_filtered' };
    }

    const providers = normalizeProviders(preferences.enabledProviders ?? []);
    const providerAllowed =
      providers.length === 0 ||
      providers.includes(arb.buyExchange.toLowerCase()) ||
      providers.includes(arb.sellExchange.toLowerCase());
    if (!providerAllowed) {
      return { allowed: false, reason: 'provider_filtered' };
    }

    if (arb.confidence < effectiveMinConfidence) {
      return { allowed: false, reason: 'min_confidence' };
    }

    if (preferences.quietHoursEnabled && isInQuietHours(now, preferences.quietHoursStart, preferences.quietHoursEnd)) {
      const netPct = arb.netPct ?? 0;
      if (netPct < 0.5) {
        return { allowed: false, reason: 'quiet_hours' };
      }
    }
  }

  if (rateLimitHit) {
    return { allowed: false, reason: 'rate_limit' };
  }

  if (cooldownHit) {
    return { allowed: false, reason: 'cooldown' };
  }

  if (effectiveMaxPerHour <= 0) {
    return { allowed: false, reason: 'max_per_hour_zero' };
  }

  return { allowed: true };
};
