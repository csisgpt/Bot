"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const config_1 = require("@nestjs/config");
const core_1 = require("../../../libs/core/src/index");
const telegram_1 = require("../../../libs/telegram/src/index");
const signals_1 = require("../../../libs/signals/src/index");
const admin_controller_1 = require("./admin.controller");
const health_controller_1 = require("./health.controller");
const tradingview_controller_1 = require("./webhooks/tradingview.controller");
const signals_controller_1 = require("./signals.controller");
const deliveries_controller_1 = require("./deliveries.controller");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            core_1.CoreModule,
            telegram_1.TelegramModule,
            signals_1.SignalsModule,
            bullmq_1.BullModule.forRootAsync({
                imports: [core_1.CoreModule],
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    connection: (0, core_1.createRedisConnection)(configService),
                }),
            }),
            bullmq_1.BullModule.registerQueue({ name: core_1.SIGNALS_QUEUE_NAME }),
        ],
        controllers: [
            admin_controller_1.AdminController,
            health_controller_1.HealthController,
            tradingview_controller_1.TradingViewWebhookController,
            signals_controller_1.SignalsController,
            deliveries_controller_1.DeliveriesController,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map