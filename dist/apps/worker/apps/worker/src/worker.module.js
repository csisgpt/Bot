"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkerModule = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const bullmq_1 = require("@nestjs/bullmq");
const core_1 = require("../../../libs/core/src/index");
const binance_1 = require("../../../libs/binance/src/index");
const signals_1 = require("../../../libs/signals/src/index");
const telegram_1 = require("../../../libs/telegram/src/index");
const health_controller_1 = require("./health.controller");
const signals_cron_1 = require("./cron/signals.cron");
const price_ticker_cron_1 = require("./cron/price-ticker.cron");
const config_1 = require("@nestjs/config");
const signals_processor_1 = require("./queues/signals.processor");
const tradingview_email_service_1 = require("./tradingview/tradingview-email.service");
let WorkerModule = class WorkerModule {
};
exports.WorkerModule = WorkerModule;
exports.WorkerModule = WorkerModule = __decorate([
    (0, common_1.Module)({
        imports: [
            core_1.CoreModule,
            binance_1.BinanceModule,
            signals_1.SignalsModule,
            telegram_1.TelegramModule,
            schedule_1.ScheduleModule.forRoot(),
            bullmq_1.BullModule.forRootAsync({
                imports: [core_1.CoreModule],
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    connection: (0, core_1.createRedisConnection)(configService),
                }),
            }),
            bullmq_1.BullModule.registerQueue({ name: core_1.SIGNALS_QUEUE_NAME }),
        ],
        controllers: [health_controller_1.HealthController],
        providers: [
            signals_cron_1.SignalsCron,
            price_ticker_cron_1.PriceTickerCron,
            signals_processor_1.SignalsProcessor,
            tradingview_email_service_1.TradingViewEmailIngestService,
        ],
    })
], WorkerModule);
//# sourceMappingURL=worker.module.js.map