"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapTradingViewPayloadToSignal = exports.parseTradingViewPayload = void 0;
const parseSide = (value) => {
    if (typeof value !== 'string') {
        return 'NEUTRAL';
    }
    const normalized = value.trim().toUpperCase();
    if (normalized === 'BUY' || normalized === 'LONG') {
        return 'BUY';
    }
    if (normalized === 'SELL' || normalized === 'SHORT') {
        return 'SELL';
    }
    return 'NEUTRAL';
};
const parseKind = (value) => {
    if (typeof value !== 'string') {
        return 'ALERT';
    }
    const normalized = value.trim().toUpperCase();
    if (normalized === 'ENTRY' || normalized === 'EXIT' || normalized === 'ALERT') {
        return normalized;
    }
    return 'ALERT';
};
const parseNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
};
const parseTime = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }
    return undefined;
};
const normalizeTags = (value) => {
    if (Array.isArray(value)) {
        return value.map((tag) => String(tag)).filter((tag) => tag.length > 0);
    }
    if (typeof value === 'string' && value.trim() !== '') {
        return value.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0);
    }
    return [];
};
const parseTradingViewPayload = (payloadRaw) => {
    if (typeof payloadRaw === 'string') {
        const trimmed = payloadRaw.trim();
        if (trimmed.length === 0) {
            return { payload: {}, rawText: payloadRaw };
        }
        try {
            const parsed = JSON.parse(trimmed);
            return { payload: parsed, rawText: payloadRaw };
        }
        catch {
            return { payload: { message: trimmed }, rawText: payloadRaw, parseError: 'Invalid JSON' };
        }
    }
    if (payloadRaw && typeof payloadRaw === 'object') {
        return { payload: payloadRaw };
    }
    return { payload: {} };
};
exports.parseTradingViewPayload = parseTradingViewPayload;
const mapTradingViewPayloadToSignal = (payloadRaw, defaults, priceFallback) => {
    const { payload, rawText } = (0, exports.parseTradingViewPayload)(payloadRaw);
    const side = parseSide(payload.signal ?? payload.side ?? payload.direction);
    const kind = parseKind(payload.kind);
    const instrument = (payload.instrument ?? payload.symbol ?? defaults.instrument);
    const interval = (payload.interval ?? payload.timeframe ?? defaults.interval);
    const assetType = (payload.assetType ?? defaults.assetType);
    const strategy = (payload.strategy ?? defaults.strategy);
    const time = parseTime(payload.time ?? payload.timestamp) ?? Date.now();
    const parsedPrice = parseNumber(payload.price);
    const price = parsedPrice ?? priceFallback ?? null;
    const confidence = parseNumber(payload.confidence) ?? 0;
    const tags = normalizeTags(payload.tags);
    const baseReason = (payload.reason ?? payload.message ?? 'TradingView alert');
    const reason = parsedPrice === undefined && priceFallback === undefined
        ? `${baseReason} (price unavailable)`
        : baseReason;
    const externalId = (payload.externalId ?? payload.id);
    return {
        source: 'TRADINGVIEW',
        assetType,
        instrument,
        interval,
        strategy,
        kind,
        side,
        price,
        time,
        confidence,
        tags: tags.length > 0 ? tags : ['tradingview'],
        reason,
        externalId,
        rawPayload: rawText ?? payload,
    };
};
exports.mapTradingViewPayloadToSignal = mapTradingViewPayloadToSignal;
//# sourceMappingURL=tradingview.mapper.js.map