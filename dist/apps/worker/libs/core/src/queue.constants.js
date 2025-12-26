"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SIGNALS_QUEUE_CONCURRENCY = exports.SIGNALS_QUEUE_NAME = void 0;
exports.SIGNALS_QUEUE_NAME = process.env.QUEUE_SIGNALS_NAME ?? 'signals';
exports.SIGNALS_QUEUE_CONCURRENCY = Number(process.env.QUEUE_CONCURRENCY ?? '5');
//# sourceMappingURL=queue.constants.js.map