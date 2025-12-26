import { Signal as PrismaSignal } from '@prisma/client';
import { Signal } from '@libs/signals';
type SignalLike = Signal | PrismaSignal;
export declare const formatSignalMessage: (signal: SignalLike) => string;
export interface PriceTickerEntry {
    symbol: string;
    price: number;
}
export declare const formatPriceTickerMessage: (entries: PriceTickerEntry[], timestamp?: number) => string;
export {};
