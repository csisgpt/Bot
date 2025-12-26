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
var PriceTickerCron_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceTickerCron = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const core_1 = require("../../../../libs/core/src/index");
const binance_1 = require("../../../../libs/binance/src/index");
const telegram_1 = require("../../../../libs/telegram/src/index");
let PriceTickerCron = PriceTickerCron_1 = class PriceTickerCron {
    constructor(configService, marketPriceService, jobRunService, signalsQueue) {
        this.configService = configService;
        this.marketPriceService = marketPriceService;
        this.jobRunService = jobRunService;
        this.signalsQueue = signalsQueue;
        this.logger = new common_1.Logger(PriceTickerCron_1.name);
    }
    onModuleInit() {
        const enabled = this.configService.get('PRICE_TICKER_ENABLED', false);
        if (!enabled) {
            return;
        }
        const intervalSeconds = this.configService.get('PRICE_TICKER_POST_SECONDS', 10);
        if (intervalSeconds <= 0) {
            this.logger.warn('PRICE_TICKER_POST_SECONDS must be greater than zero.');
            return;
        }
        this.logger.log(`Price ticker enabled (every ${intervalSeconds}s).`);
        this.timer = setInterval(() => {
            void this.handleTick();
        }, intervalSeconds * 1000);
    }
    onModuleDestroy() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
    }
    async handleTick() {
        const jobRun = await this.jobRunService.start('price_ticker');
        const stats = { snapshots: 0 };
        try {
            const instruments = this.parseList(this.configService.get('PRICE_TICKER_INSTRUMENTS', 'XAUTUSDT'));
            if (instruments.length === 0) {
                this.logger.warn('PRICE_TICKER_INSTRUMENTS is empty.');
                await this.jobRunService.success(jobRun.id, stats);
                return;
            }
            const snapshots = [];
            for (const instrument of instruments) {
                const snapshot = await this.marketPriceService.getLastPrice(instrument);
                if (snapshot) {
                    snapshots.push(snapshot);
                }
                else {
                    this.logger.warn(`No price available for ${instrument}.`);
                }
            }
            if (snapshots.length === 0) {
                await this.jobRunService.success(jobRun.id, stats);
                return;
            }
            stats.snapshots = snapshots.length;
            const entries = snapshots.map((snapshot) => ({
                symbol: snapshot.symbol,
                price: snapshot.price,
            }));
            const message = (0, telegram_1.formatPriceTickerMessage)(entries, Date.now());
            const postToGroup = this.configService.get('PRICE_TICKER_POST_TO_GROUP', true);
            const postToChannel = this.configService.get('PRICE_TICKER_POST_TO_CHANNEL', true);
            if (postToGroup) {
                const groupId = this.configService.get('TELEGRAM_SIGNAL_GROUP_ID', '');
                if (groupId) {
                    await (0, telegram_1.enqueueTextMessage)(this.signalsQueue, groupId, message);
                }
                else {
                    this.logger.warn('PRICE_TICKER_POST_TO_GROUP enabled but TELEGRAM_SIGNAL_GROUP_ID missing.');
                }
            }
            if (postToChannel) {
                const channelId = this.configService.get('TELEGRAM_SIGNAL_CHANNEL_ID', '');
                if (channelId) {
                    await (0, telegram_1.enqueueTextMessage)(this.signalsQueue, channelId, message);
                }
                else {
                    this.logger.warn('PRICE_TICKER_POST_TO_CHANNEL enabled but TELEGRAM_SIGNAL_CHANNEL_ID missing.');
                }
            }
            await this.jobRunService.success(jobRun.id, stats);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            await this.jobRunService.fail(jobRun.id, message, stats);
            throw error;
        }
    }
    parseList(value) {
        return (value ?? '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }
};
exports.PriceTickerCron = PriceTickerCron;
exports.PriceTickerCron = PriceTickerCron = PriceTickerCron_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, bullmq_1.InjectQueue)(core_1.SIGNALS_QUEUE_NAME)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        binance_1.MarketPriceService,
        core_1.JobRunService,
        bullmq_2.Queue])
], PriceTickerCron);
//# sourceMappingURL=price-ticker.cron.js.map