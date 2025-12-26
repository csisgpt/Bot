import { Signal } from '@libs/signals';
export declare const formatSignalMessage: (signal: Signal) => string;
export interface PriceTickerEntry {
    symbol: string;
    price: number;
}
export declare const formatPriceTickerMessage: (entries: PriceTickerEntry[], timestamp?: number) => string;
