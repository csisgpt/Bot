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
var TradingViewIngestProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingViewIngestProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_2 = require("bullmq");
const core_1 = require("../../../../libs/core/src/index");
const signals_1 = require("../../../../libs/signals/src/index");
let TradingViewIngestProcessor = TradingViewIngestProcessor_1 = class TradingViewIngestProcessor extends bullmq_1.WorkerHost {
    constructor(configService, signalsService, signalDedupeService, feedRegistry, routingService, signalDeliveryService, signalsQueue) {
        super();
        this.configService = configService;
        this.signalsService = signalsService;
        this.signalDedupeService = signalDedupeService;
        this.feedRegistry = feedRegistry;
        this.routingService = routingService;
        this.signalDeliveryService = signalDeliveryService;
        this.signalsQueue = signalsQueue;
        this.logger = new common_1.Logger(TradingViewIngestProcessor_1.name);
    }
    async process(job) {
        if (job.name !== 'ingestTradingViewAlert') {
            return;
        }
        try {
            const { payloadRaw } = job.data;
            const { payload, parseError } = (0, signals_1.parseTradingViewPayload)(payloadRaw);
            if (parseError) {
                this.logger.warn(`TradingView payload parse error for job ${job.id ?? 'unknown'}: ${parseError}`);
            }
            const defaults = this.getDefaults();
            const priceFallback = await this.resolvePriceFallback(payload, defaults);
            const signal = (0, signals_1.mapTradingViewPayloadToSignal)(payloadRaw, defaults, priceFallback);
            if (signal.price === null) {
                this.logger.warn(`TradingView price unavailable for job ${job.id ?? 'unknown'} (${signal.instrument} ${signal.interval})`);
            }
            const shouldProcess = await this.signalDedupeService.isAllowed(signal);
            if (!shouldProcess) {
                return;
            }
            const storedSignal = await this.signalsService.storeSignal(signal);
            if (!storedSignal) {
                return;
            }
            const destinations = await this.routingService.resolveDestinations(signal);
            const deliveries = await this.signalDeliveryService.createPendingDeliveries(storedSignal.id, destinations);
            for (const delivery of deliveries) {
                await this.signalsQueue.add('sendTelegramDelivery', { deliveryId: delivery.id }, {
                    attempts: 3,
                    removeOnComplete: true,
                    removeOnFail: { count: 50 },
                });
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            const { payloadRaw } = job.data;
            const { payload } = (0, signals_1.parseTradingViewPayload)(payloadRaw);
            const instrument = (payload.instrument ?? payload.symbol ?? 'unknown');
            const interval = (payload.interval ?? payload.timeframe ?? 'unknown');
            const strategy = (payload.strategy ?? 'unknown');
            this.logger.error(`TradingView ingest failed for job ${job.id ?? 'unknown'} (${instrument} ${interval} ${strategy}): ${message}`);
            throw error;
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
        try {
            const feed = this.feedRegistry.getFeed(assetType);
            const candles = await feed.getCandles({ instrument, interval, limit: 1 });
            if (candles.length > 0) {
                return candles[candles.length - 1].close;
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.logger.warn(`Failed to resolve TradingView price fallback: ${message}`);
        }
        return undefined;
    }
};
exports.TradingViewIngestProcessor = TradingViewIngestProcessor;
exports.TradingViewIngestProcessor = TradingViewIngestProcessor = TradingViewIngestProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    (0, bullmq_1.Processor)(core_1.SIGNALS_QUEUE_NAME, { concurrency: core_1.SIGNALS_QUEUE_CONCURRENCY }),
    __param(6, (0, bullmq_1.InjectQueue)(core_1.SIGNALS_QUEUE_NAME)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        signals_1.SignalsService,
        signals_1.SignalDedupeService,
        signals_1.FeedRegistry,
        signals_1.RoutingService,
        signals_1.SignalDeliveryService,
        bullmq_2.Queue])
], TradingViewIngestProcessor);
//# sourceMappingURL=tradingview-ingest.processor.js.map