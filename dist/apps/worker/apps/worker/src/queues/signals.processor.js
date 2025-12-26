"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SignalsProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalsProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_2 = require("bullmq");
const core_1 = require("../../../../libs/core/src/index");
const signals_1 = require("../../../../libs/signals/src/index");
const telegram_1 = require("../../../../libs/telegram/src/index");
let SignalsProcessor = SignalsProcessor_1 = class SignalsProcessor extends bullmq_1.WorkerHost {
    constructor(configService, signalsService, signalDedupeService, feedRegistry, telegramService, signalsQueue) {
        super();
        this.configService = configService;
        this.signalsService = signalsService;
        this.signalDedupeService = signalDedupeService;
        this.feedRegistry = feedRegistry;
        this.telegramService = telegramService;
        this.signalsQueue = signalsQueue;
        this.logger = new common_1.Logger(SignalsProcessor_1.name);
    }
    async process(job) {
        switch (job.name) {
            case 'ingestTradingViewAlert':
                await this.handleTradingViewIngest(job);
                return;
            case 'sendTelegramSignal':
                await this.handleSendTelegramSignal(job);
                return;
            case 'sendTelegramText':
                await this.handleSendTelegramText(job);
                return;
            default:
                this.logger.warn(`Unknown job name "${job.name}" (id=${job.id ?? 'unknown'})`);
                return;
        }
    }
    async handleTradingViewIngest(job) {
        const startedAt = Date.now();
        const { payloadRaw } = job.data;
        const { payload, parseError } = (0, signals_1.parseTradingViewPayload)(payloadRaw);
        const instrument = (payload.instrument ?? payload.symbol ?? 'unknown');
        const interval = (payload.interval ?? payload.timeframe ?? 'unknown');
        const strategy = (payload.strategy ?? 'unknown');
        try {
            if (parseError) {
                this.logger.warn(`TradingView payload parse error for job ${job.id ?? 'unknown'}: ${parseError}`);
            }
            const defaults = this.getDefaults();
            const signal = (0, signals_1.mapTradingViewPayloadToSignal)(payloadRaw, defaults, undefined);
            signal.source = signal.source ?? 'TRADINGVIEW';
            const sendAllTv = this.configService.get('TRADINGVIEW_SEND_ALL', 'true') === 'true';
            const source = signal.source ?? 'BINANCE';
            if (!sendAllTv || source !== 'TRADINGVIEW') {
                const shouldProcess = await this.signalDedupeService.isAllowed(signal);
                if (!shouldProcess) {
                    this.logger.warn(`Dedupe BLOCKED (${signal.instrument} ${signal.interval} ${signal.side}) strategy=${signal.strategy}`);
                    return;
                }
            }
            const attempts = this.getNumber('SIGNALS_TELEGRAM_JOB_ATTEMPTS', 5);
            const backoffDelayMs = this.getNumber('SIGNALS_TELEGRAM_JOB_BACKOFF_DELAY_MS', 2000);
            const priority = this.getNumber('SIGNALS_TELEGRAM_JOB_PRIORITY', 1);
            const telegramJob = await this.signalsQueue.add('sendTelegramSignal', signal, {
                priority,
                attempts,
                backoff: { type: 'exponential', delay: backoffDelayMs },
                removeOnComplete: true,
                removeOnFail: { count: 200 },
            });
            this.logger.log(`Enqueued sendTelegramSignal jobId=${telegramJob.id ?? 'unknown'} (${signal.instrument} ${signal.interval} ${signal.side})`);
            await this.signalsService.storeSignal(signal);
            if (signal.price === null) {
                const priceFallbackTimeoutMs = this.getNumber('TRADINGVIEW_PRICE_FALLBACK_TIMEOUT_MS', 500);
                void this.withTimeout(this.resolvePriceFallback(payload, defaults), priceFallbackTimeoutMs, undefined).catch((e) => this.logger.warn(`Failed to resolve TradingView price fallback: ${e?.message ?? e}`));
            }
            const elapsedMs = Date.now() - startedAt;
            if (elapsedMs > 1000) {
                this.logger.warn(`TradingView ingest slow job ${job.id ?? 'unknown'} (${instrument} ${interval} ${strategy}) took ${elapsedMs}ms`);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(`TradingView ingest failed for job ${job.id ?? 'unknown'} (${instrument} ${interval} ${strategy}): ${message}`);
            throw error;
        }
    }
    async handleSendTelegramSignal(job) {
        try {
            await this.telegramService.sendSignal(job.data);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            this.logger.error(`sendTelegramSignal failed job ${job.id ?? 'unknown'} (${job.data.instrument} ${job.data.interval} ${job.data.side}): ${message}`);
            throw err;
        }
    }
    async handleSendTelegramText(job) {
        const payload = telegram_1.telegramTextJobSchema.parse(job.data);
        try {
            await this.telegramService.sendMessage(String(payload.chatId), payload.text, payload.parseMode);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            this.logger.error(`sendTelegramText failed job ${job.id ?? 'unknown'}: ${message}`);
            throw err;
        }
    }
    getDefaults() {
        const defaultInterval = this.configService.get('TRADINGVIEW_DEFAULT_INTERVAL', this.configService.get('BINANCE_INTERVAL', '15m'));
        return {
            assetType: this.configService.get('TRADINGVIEW_DEFAULT_ASSET_TYPE', 'GOLD'),
            instrument: this.configService.get('TRADINGVIEW_DEFAULT_INSTRUMENT', 'XAUTUSDT'),
            interval: defaultInterval,
            strategy: this.configService.get('TRADINGVIEW_DEFAULT_STRATEGY', 'tradingview'),
        };
    }
    async resolvePriceFallback(payload, defaults) {
        const priceValue = payload.price;
        if (priceValue !== undefined && priceValue !== null && `${priceValue}`.trim() !== '') {
            return undefined;
        }
        const assetType = (payload.assetType ?? defaults.assetType);
        const instrument = (payload.instrument ?? payload.symbol ?? defaults.instrument);
        const interval = (payload.interval ?? payload.timeframe ?? defaults.interval);
        const feed = this.feedRegistry.getFeed(assetType);
        const candles = await feed.getCandles({ instrument, interval, limit: 1 });
        if (candles.length > 0)
            return candles[candles.length - 1].close;
        return undefined;
    }
    getNumber(key, fallback) {
        const raw = this.configService.get(key);
        if (raw === undefined || raw === null || raw === '')
            return fallback;
        const n = typeof raw === 'number' ? raw : Number(raw);
        return Number.isFinite(n) ? n : fallback;
    }
    async withTimeout(promise, timeoutMs, fallback) {
        if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
            return promise;
        return Promise.race([
            promise,
            new Promise((resolve) => {
                const t = setTimeout(() => {
                    clearTimeout(t);
                    resolve(fallback);
                }, timeoutMs);
            }),
        ]);
    }
};
exports.SignalsProcessor = SignalsProcessor;
exports.SignalsProcessor = SignalsProcessor = SignalsProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    (0, bullmq_1.Processor)(core_1.SIGNALS_QUEUE_NAME, { concurrency: core_1.SIGNALS_QUEUE_CONCURRENCY }),
    __param(5, (0, bullmq_1.InjectQueue)(core_1.SIGNALS_QUEUE_NAME)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        signals_1.SignalsService,
        signals_1.SignalDedupeService,
        signals_1.FeedRegistry,
        telegram_1.TelegramService,
        bullmq_2.Queue])
], SignalsProcessor);
//# sourceMappingURL=signals.processor.js.map