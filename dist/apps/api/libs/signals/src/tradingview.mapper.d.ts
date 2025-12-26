import { Signal } from './types';
export interface TradingViewDefaults {
    assetType: Signal['assetType'];
    instrument: string;
    interval: string;
    strategy: string;
}
export declare const parseTradingViewPayload: (payloadRaw: unknown) => {
    payload: Record<string, unknown>;
    rawText?: string;
    parseError?: string;
};
export declare const mapTradingViewPayloadToSignal: (payloadRaw: unknown, defaults: TradingViewDefaults, priceFallback?: number) => Signal;
