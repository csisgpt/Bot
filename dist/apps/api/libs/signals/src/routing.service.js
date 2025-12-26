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
var RoutingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoutingService = exports.matchesRoutingRule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("../../core/src/index");
const matchesRoutingRule = (rule, signal, context) => {
    if (rule.assetType && rule.assetType !== signal.assetType) {
        return false;
    }
    if (rule.interval && rule.interval !== signal.interval) {
        return false;
    }
    if (rule.minConfidence !== null && rule.minConfidence !== undefined) {
        if (signal.confidence < rule.minConfidence) {
            return false;
        }
    }
    if (rule.instrumentId && rule.instrumentId !== context.instrumentId) {
        return false;
    }
    if (rule.strategyId && rule.strategyId !== context.strategyId) {
        return false;
    }
    return true;
};
exports.matchesRoutingRule = matchesRoutingRule;
let RoutingService = RoutingService_1 = class RoutingService {
    constructor(prismaService, configService) {
        this.prismaService = prismaService;
        this.configService = configService;
        this.logger = new common_1.Logger(RoutingService_1.name);
    }
    async resolveDestinations(signal) {
        const [instrument, strategy, rules] = await Promise.all([
            this.prismaService.instrument.findFirst({
                where: {
                    symbol: signal.instrument,
                    assetType: signal.assetType,
                    isActive: true,
                },
            }),
            this.prismaService.strategy.findFirst({
                where: {
                    key: signal.strategy,
                    isActive: true,
                },
            }),
            this.prismaService.routingRule.findMany({
                where: {
                    isActive: true,
                    destination: {
                        isActive: true,
                    },
                },
                include: {
                    destination: true,
                },
            }),
        ]);
        if (rules.length === 0) {
            return this.ensureFallbackDestinations();
        }
        const context = {
            instrumentId: instrument?.id ?? null,
            strategyId: strategy?.id ?? null,
        };
        const destinations = rules
            .filter((rule) => (0, exports.matchesRoutingRule)(rule, signal, context))
            .map((rule) => rule.destination);
        const unique = new Map();
        for (const destination of destinations) {
            unique.set(destination.id, destination);
        }
        return Array.from(unique.values());
    }
    async ensureFallbackDestinations() {
        const fallbackTargets = this.getFallbackTargets();
        if (fallbackTargets.length === 0) {
            this.logger.warn('No routing rules or fallback Telegram destinations configured.');
            return [];
        }
        const destinations = await this.prismaService.$transaction(fallbackTargets.map((target) => this.prismaService.telegramDestination.upsert({
            where: {
                destinationType_chatId: {
                    destinationType: target.destinationType,
                    chatId: target.chatId,
                },
            },
            create: {
                destinationType: target.destinationType,
                chatId: target.chatId,
                title: target.title ?? undefined,
                isActive: true,
            },
            update: {
                title: target.title ?? undefined,
                isActive: true,
            },
        })));
        return destinations;
    }
    getFallbackTargets() {
        const targets = [];
        const directChatId = this.configService.get('TELEGRAM_CHAT_ID', '').trim();
        const directType = this.configService.get('TELEGRAM_CHAT_TYPE', 'GROUP');
        if (directChatId) {
            targets.push({
                destinationType: directType.toUpperCase() === 'CHANNEL' ? 'CHANNEL' : 'GROUP',
                chatId: directChatId,
            });
        }
        const channelId = this.configService.get('TELEGRAM_SIGNAL_CHANNEL_ID', '').trim();
        if (channelId) {
            targets.push({
                destinationType: 'CHANNEL',
                chatId: channelId,
                title: this.configService.get('TELEGRAM_SIGNAL_CHANNEL_TITLE', undefined),
            });
        }
        const groupId = this.configService.get('TELEGRAM_SIGNAL_GROUP_ID', '').trim();
        if (groupId) {
            targets.push({
                destinationType: 'GROUP',
                chatId: groupId,
                title: this.configService.get('TELEGRAM_SIGNAL_GROUP_TITLE', undefined),
            });
        }
        return targets;
    }
};
exports.RoutingService = RoutingService;
exports.RoutingService = RoutingService = RoutingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.PrismaService,
        config_1.ConfigService])
], RoutingService);
//# sourceMappingURL=routing.service.js.map