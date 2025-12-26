"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatPriceTickerMessage = exports.formatSignalMessage = void 0;
const formatNumber = (value) => value.toFixed(4);
const formatPrice = (value) => value === null || value === undefined ? 'N/A' : formatNumber(value);
const formatLevels = (levels) => {
    if (!levels) {
        return [];
    }
    const rows = [];
    if (levels.entry !== undefined) {
        rows.push(`<b>Entry:</b> ${formatNumber(levels.entry)}`);
    }
    if (levels.sl !== undefined) {
        rows.push(`<b>SL:</b> ${formatNumber(levels.sl)}`);
    }
    if (levels.tp1 !== undefined) {
        rows.push(`<b>TP1:</b> ${formatNumber(levels.tp1)}`);
    }
    if (levels.tp2 !== undefined) {
        rows.push(`<b>TP2:</b> ${formatNumber(levels.tp2)}`);
    }
    return rows;
};
const formatSignalMessage = (signal) => {
    const header = signal.side === 'BUY' ? '🟢 1خ' : signal.side === 'SELL' ? '🔴 1ف' : '⚪️ NEUTRAL';
    const lines = [
        `<b>${header}</b>`,
        `<b>Asset:</b> ${signal.assetType}`,
        `<b>Instrument:</b> ${signal.instrument}`,
        `<b>Interval:</b> ${signal.interval}`,
        `<b>Strategy:</b> ${signal.strategy}`,
        `<b>Price:</b> ${formatPrice(signal.price)}`,
        `<b>Confidence:</b> ${signal.confidence}%`,
        `<b>Tags:</b> ${signal.tags.join(', ') || 'n/a'}`,
        `<b>Reason:</b> ${signal.reason}`,
    ];
    const levels = formatLevels(signal.levels);
    if (levels.length > 0) {
        lines.push('<b>Levels</b>');
        lines.push(...levels);
    }
    lines.push(`<b>Time:</b> ${new Date(signal.time).toISOString()}`);
    return lines.join('\n');
};
exports.formatSignalMessage = formatSignalMessage;
const formatUtcTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const iso = date.toISOString();
    return `${iso.slice(0, 19).replace('T', ' ')} UTC`;
};
const formatPriceTickerMessage = (entries, timestamp = Date.now()) => {
    const lines = ['🟡 Price Ticker (Binance)', formatUtcTimestamp(timestamp)];
    for (const entry of entries) {
        lines.push(`${entry.symbol}: ${formatNumber(entry.price)}`);
    }
    return lines.join('\n');
};
exports.formatPriceTickerMessage = formatPriceTickerMessage;
//# sourceMappingURL=telegram.formatter.js.map