"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSignalDedupeKey = exports.floorSignalTimeToBucket = void 0;
const DEFAULT_BUCKET_MS = 60_000;
const intervalToMs = (interval) => {
    if (!interval) {
        return null;
    }
    const normalized = interval.trim().toLowerCase();
    const match = normalized.match(/^(\d+)([smhdw])$/);
    if (!match) {
        return null;
    }
    const value = Number(match[1]);
    if (!Number.isFinite(value) || value <= 0) {
        return null;
    }
    const unit = match[2];
    switch (unit) {
        case 's':
            return value * 1000;
        case 'm':
            return value * 60_000;
        case 'h':
            return value * 3_600_000;
        case 'd':
            return value * 86_400_000;
        case 'w':
            return value * 604_800_000;
        default:
            return null;
    }
};
const floorSignalTimeToBucket = (timeMs, interval) => {
    const bucketMs = intervalToMs(interval) ?? DEFAULT_BUCKET_MS;
    return Math.floor(timeMs / bucketMs) * bucketMs;
};
exports.floorSignalTimeToBucket = floorSignalTimeToBucket;
const buildSignalDedupeKey = (signal) => {
    const source = signal.source ?? 'BINANCE';
    const bucketTime = new Date((0, exports.floorSignalTimeToBucket)(signal.time, signal.interval)).toISOString();
    return [
        source,
        signal.assetType,
        signal.instrument,
        signal.interval,
        signal.strategy,
        signal.kind,
        signal.side,
        bucketTime,
    ].join(':');
};
exports.buildSignalDedupeKey = buildSignalDedupeKey;
//# sourceMappingURL=dedupe.js.map