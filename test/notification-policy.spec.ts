import { describe, expect, it } from 'vitest';
import {
  evaluatePolicy,
  ChatPreferences,
  isInQuietHours,
} from '../apps/worker/src/notifications/policy/policy-engine';
import { normalizeMode } from '../apps/worker/src/notifications/policy/mode-presets';

const basePrefs = (): ChatPreferences => ({
  chatId: 'chat-1',
  mode: 'NORMAL',
  watchlist: [],
  enabledProviders: [],
  enabledFeatures: { signals: true, news: true, arbitrage: true },
  quietHoursEnabled: true,
  quietHoursStart: '23:00',
  quietHoursEnd: '08:00',
  maxNotifsPerHour: 12,
  cooldownSignalsSec: 600,
  cooldownNewsSec: 1800,
  cooldownArbSec: 300,
  minConfidence: 60,
  digestEnabled: false,
  digestTimes: [],
  assetsEnabled: [],
  timeframes: [],
  mutedInstruments: [],
});

describe('notification policy engine', () => {
  it('blocks low confidence signals during quiet hours', () => {
    const decision = evaluatePolicy({
      entityType: 'SIGNAL',
      preferences: basePrefs(),
      now: new Date(Date.UTC(2024, 1, 1, 23, 30)),
      timeZone: 'Europe/Berlin',
      signal: {
        assetType: 'CRYPTO',
        instrument: 'BTCUSDT',
        interval: '15m',
        strategy: 'ema_rsi',
        confidence: 70,
        source: 'BINANCE',
      },
      rateLimitHit: false,
      cooldownHit: false,
    });

    expect(decision.action).toBe('SKIP');
    expect(decision.reason).toBe('quiet_hours');
  });

  it('blocks when rate limit is hit', () => {
    const decision = evaluatePolicy({
      entityType: 'SIGNAL',
      preferences: basePrefs(),
      now: new Date(),
      timeZone: 'Europe/Berlin',
      signal: {
        assetType: 'CRYPTO',
        instrument: 'BTCUSDT',
        interval: '15m',
        strategy: 'ema_rsi',
        confidence: 90,
        source: 'BINANCE',
      },
      rateLimitHit: true,
      cooldownHit: false,
    });

    expect(decision.action).toBe('SKIP');
    expect(decision.reason).toBe('rate_limit');
  });

  it('applies watchlist filtering', () => {
    const prefs = basePrefs();
    prefs.watchlist = ['BTCUSDT'];

    const decision = evaluatePolicy({
      entityType: 'SIGNAL',
      preferences: prefs,
      now: new Date(),
      timeZone: 'Europe/Berlin',
      signal: {
        assetType: 'CRYPTO',
        instrument: 'ETHUSDT',
        interval: '15m',
        strategy: 'ema_rsi',
        confidence: 90,
        source: 'BINANCE',
      },
      rateLimitHit: false,
      cooldownHit: false,
    });

    expect(decision.action).toBe('SKIP');
    expect(decision.reason).toBe('watchlist_filtered');
  });

  it('applies provider filtering', () => {
    const prefs = basePrefs();
    prefs.enabledProviders = ['binance'];

    const decision = evaluatePolicy({
      entityType: 'NEWS',
      preferences: prefs,
      now: new Date(),
      timeZone: 'Europe/Berlin',
      news: {
        provider: 'okx',
        title: 'Test',
        category: 'Updates',
        tags: [],
        url: 'https://example.com',
      },
      rateLimitHit: false,
      cooldownHit: false,
    });

    expect(decision.action).toBe('SKIP');
    expect(decision.reason).toBe('provider_filtered');
  });

  it('blocks when cooldown is active', () => {
    const decision = evaluatePolicy({
      entityType: 'ARB',
      preferences: basePrefs(),
      now: new Date(),
      timeZone: 'Europe/Berlin',
      arb: {
        canonicalSymbol: 'BTCUSDT',
        buyExchange: 'binance',
        sellExchange: 'okx',
        netPct: 1,
        confidence: 90,
      },
      rateLimitHit: false,
      cooldownHit: true,
    });

    expect(decision.action).toBe('SKIP');
    expect(decision.reason).toBe('cooldown');
  });

  it('buffers non-high-priority notifications when digest is enabled', () => {
    const prefs = basePrefs();
    prefs.digestEnabled = true;

    const decision = evaluatePolicy({
      entityType: 'SIGNAL',
      preferences: prefs,
      now: new Date(),
      timeZone: 'Europe/Berlin',
      signal: {
        assetType: 'CRYPTO',
        instrument: 'BTCUSDT',
        interval: '15m',
        strategy: 'ema_rsi',
        confidence: 70,
        source: 'BINANCE',
      },
      rateLimitHit: false,
      cooldownHit: false,
    });

    expect(decision.action).toBe('DIGEST');
  });

  it('allows high-priority notifications even when digest is enabled', () => {
    const prefs = basePrefs();
    prefs.digestEnabled = true;

    const decision = evaluatePolicy({
      entityType: 'SIGNAL',
      preferences: prefs,
      now: new Date(),
      timeZone: 'Europe/Berlin',
      signal: {
        assetType: 'CRYPTO',
        instrument: 'BTCUSDT',
        interval: '15m',
        strategy: 'ema_rsi',
        confidence: 90,
        source: 'BINANCE',
      },
      rateLimitHit: false,
      cooldownHit: false,
    });

    expect(decision.action).toBe('ALLOW');
  });

  it('maps legacy modes to new presets', () => {
    expect(normalizeMode('QUIET')).toBe('SLEEP');
    expect(normalizeMode('AGGRESSIVE')).toBe('SCALP');
  });

  it('handles overnight quiet hours using timezone', () => {
    const now = new Date(Date.UTC(2024, 1, 1, 23, 30));
    const inQuiet = isInQuietHours(now, '23:00', '08:00', 'Europe/Berlin');
    expect(inQuiet).toBe(true);
  });
});
