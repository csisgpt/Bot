import { Signal } from './types';
export declare const floorSignalTimeToBucket: (timeMs: number, interval?: string) => number;
export declare const buildSignalDedupeKey: (signal: Signal) => string;
