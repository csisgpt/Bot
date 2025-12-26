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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingViewWebhookController = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const config_1 = require("@nestjs/config");
const core_1 = require("../../../../libs/core/src/index");
let TradingViewWebhookController = class TradingViewWebhookController {
    constructor(configService, signalsQueue) {
        this.configService = configService;
        this.signalsQueue = signalsQueue;
    }
    async handleTradingViewWebhook(request, body, headerToken, queryToken) {
        const enabled = this.configService.get('TRADINGVIEW_WEBHOOK_ENABLED', false);
        if (!enabled) {
            throw new common_1.NotFoundException();
        }
        const secret = this.configService.get('TRADINGVIEW_WEBHOOK_SECRET', '');
        const bodyToken = this.extractBodyToken(body);
        const token = headerToken ?? queryToken ?? bodyToken;
        if (!secret || token !== secret) {
            throw new common_1.UnauthorizedException();
        }
        await this.signalsQueue.add('ingestTradingViewAlert', {
            receivedAt: new Date().toISOString(),
            ip: request.ip,
            headersSubset: {
                'user-agent': request.headers['user-agent'],
                'content-type': request.headers['content-type'],
            },
            payloadRaw: body,
        }, {
            removeOnComplete: true,
            removeOnFail: { count: 50 },
        });
        return { ok: true };
    }
    extractBodyToken(body) {
        if (!body) {
            return undefined;
        }
        if (typeof body === 'object') {
            return body.token;
        }
        if (typeof body === 'string') {
            const trimmed = body.trim();
            if (!trimmed) {
                return undefined;
            }
            try {
                const parsed = JSON.parse(trimmed);
                return parsed.token;
            }
            catch {
                return undefined;
            }
        }
        return undefined;
    }
};
exports.TradingViewWebhookController = TradingViewWebhookController;
__decorate([
    (0, common_1.Post)('tradingview'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('x-tv-token')),
    __param(3, (0, common_1.Query)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, String]),
    __metadata("design:returntype", Promise)
], TradingViewWebhookController.prototype, "handleTradingViewWebhook", null);
exports.TradingViewWebhookController = TradingViewWebhookController = __decorate([
    (0, common_1.Controller)('webhooks'),
    __param(1, (0, bullmq_1.InjectQueue)(core_1.SIGNALS_QUEUE_NAME)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        bullmq_2.Queue])
], TradingViewWebhookController);
//# sourceMappingURL=tradingview.controller.js.map