import crypto from 'crypto';
import { Candle, InstrumentMapping, NewsItem, Ticker } from './models';

export const normalizeBinanceBookTicker = (
  payload: { s: string; b: string; a: string; E?: number },
  mapping: InstrumentMapping,
): Ticker | null => {
  const bid = Number(payload.b);
  const ask = Number(payload.a);
  if (!Number.isFinite(bid) || !Number.isFinite(ask)) {
    return null;
  }
  const last = Number.isFinite(bid + ask) ? (bid + ask) / 2 : bid;
  const ts = Number.isFinite(payload.E) ? payload.E! : Date.now();
  return {
    provider: mapping.provider,
    canonicalSymbol: mapping.canonicalSymbol,
    ts,
    last,
    bid,
    ask,
  };
};

export const normalizeBybitKline = (
  payload: {
    data: { start: number; open: string; high: string; low: string; close: string; volume: string; confirm: boolean };
    ts?: number;
  },
  mapping: InstrumentMapping,
  timeframe: string,
): Candle | null => {
  const candle = payload.data;
  const open = Number(candle.open);
  const high = Number(candle.high);
  const low = Number(candle.low);
  const close = Number(candle.close);
  const volume = Number(candle.volume);
  if (![open, high, low, close, volume].every(Number.isFinite)) {
    return null;
  }

  return {
    provider: mapping.provider,
    canonicalSymbol: mapping.canonicalSymbol,
    timeframe,
    openTime: candle.start,
    open,
    high,
    low,
    close,
    volume,
    isFinal: Boolean(candle.confirm),
  };
};

export const normalizeOkxRestCandle = (
  payload: string[],
  mapping: InstrumentMapping,
  timeframe: string,
): Candle | null => {
  const [ts, open, high, low, close, volume] = payload;
  const openTime = Number(ts);
  const openNum = Number(open);
  const highNum = Number(high);
  const lowNum = Number(low);
  const closeNum = Number(close);
  const volumeNum = Number(volume);
  if (![openTime, openNum, highNum, lowNum, closeNum, volumeNum].every(Number.isFinite)) {
    return null;
  }

  return {
    provider: mapping.provider,
    canonicalSymbol: mapping.canonicalSymbol,
    timeframe,
    openTime,
    open: openNum,
    high: highNum,
    low: lowNum,
    close: closeNum,
    volume: volumeNum,
    isFinal: true,
  };
};

export const normalizeTickerFromBestBidAsk = (
  provider: string,
  mapping: InstrumentMapping,
  bid: number,
  ask: number,
  last: number,
  ts: number,
  volume24h?: number,
): Ticker | null => {
  if (![bid, ask, last].every(Number.isFinite)) {
    return null;
  }
  return {
    provider,
    canonicalSymbol: mapping.canonicalSymbol,
    ts,
    last,
    bid,
    ask,
    volume24h,
  };
};

export const hashNewsItem = (item: Pick<NewsItem, 'title' | 'url' | 'provider'>): string => {
  return crypto
    .createHash('sha256')
    .update(`${item.provider}::${item.title}::${item.url}`)
    .digest('hex');
};
