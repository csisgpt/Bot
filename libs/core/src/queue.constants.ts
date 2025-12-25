export const SIGNALS_QUEUE_NAME = process.env.QUEUE_SIGNALS_NAME ?? 'signals';
export const SIGNALS_QUEUE_CONCURRENCY = Number(process.env.QUEUE_CONCURRENCY ?? '5');
