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
var SeedService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeedService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("../../core/src/index");
let SeedService = SeedService_1 = class SeedService {
    constructor(prismaService, configService) {
        this.prismaService = prismaService;
        this.configService = configService;
        this.logger = new common_1.Logger(SeedService_1.name);
    }
    async onModuleInit() {
        const enabled = this.configService.get('SEED_ON_STARTUP', true);
        if (!enabled) {
            return;
        }
        await this.seed();
    }
    async seed() {
        const strategyKey = this.configService.get('DEFAULT_STRATEGY_KEY', 'default');
        const strategyName = this.configService.get('DEFAULT_STRATEGY_NAME', 'Default');
        const strategy = await this.prismaService.strategy.upsert({
            where: { key: strategyKey },
            create: { key: strategyKey, name: strategyName, isActive: true },
            update: { name: strategyName, isActive: true },
        });
        const instruments = await this.ensureInstruments();
        const destinations = await this.ensureDestinations();
        const rules = await this.ensureRoutingRules(destinations);
        this.logger.log(`Seed completed: ${instruments.length} instruments, ${destinations.length} destinations, ${rules} rules, strategy ${strategy.key}.`);
        return {
            strategies: 1,
            instruments: instruments.length,
            destinations: destinations.length,
            rules,
        };
    }
    async ensureInstruments() {
        const targets = [];
        const goldSymbols = this.parseList(this.configService.get('GOLD_INSTRUMENTS', 'XAUTUSDT'));
        const cryptoSymbols = this.parseList(this.configService.get('CRYPTO_INSTRUMENTS', ''));
        const legacySymbols = this.parseList(this.configService.get('BINANCE_SYMBOLS', ''));
        const cryptoTargets = cryptoSymbols.length > 0 ? cryptoSymbols : legacySymbols;
        for (const symbol of goldSymbols) {
            targets.push({ assetType: 'GOLD', symbol });
        }
        for (const symbol of cryptoTargets) {
            targets.push({ assetType: 'CRYPTO', symbol });
        }
        if (targets.length === 0) {
            targets.push({ assetType: 'GOLD', symbol: 'XAUTUSDT' });
        }
        const instruments = await this.prismaService.$transaction(targets.map((target) => this.prismaService.instrument.upsert({
            where: { symbol: target.symbol },
            create: {
                symbol: target.symbol,
                assetType: target.assetType,
                isActive: true,
            },
            update: {
                assetType: target.assetType,
                isActive: true,
            },
        })));
        return instruments;
    }
    async ensureDestinations() {
        const destinations = this.getDestinationTargets();
        if (destinations.length === 0) {
            return [];
        }
        return this.prismaService.$transaction(destinations.map((destination) => this.prismaService.telegramDestination.upsert({
            where: {
                destinationType_chatId: {
                    destinationType: destination.destinationType,
                    chatId: destination.chatId,
                },
            },
            create: {
                destinationType: destination.destinationType,
                chatId: destination.chatId,
                title: destination.title ?? undefined,
                isActive: true,
            },
            update: {
                title: destination.title ?? undefined,
                isActive: true,
            },
        })));
    }
    async ensureRoutingRules(destinations) {
        if (destinations.length === 0) {
            return 0;
        }
        let created = 0;
        for (const destination of destinations) {
            const existing = await this.prismaService.routingRule.findFirst({
                where: {
                    destinationId: destination.id,
                    assetType: null,
                    instrumentId: null,
                    strategyId: null,
                    interval: null,
                    minConfidence: null,
                },
            });
            if (!existing) {
                await this.prismaService.routingRule.create({
                    data: {
                        destinationId: destination.id,
                        isActive: true,
                    },
                });
                created += 1;
            }
        }
        return created;
    }
    getDestinationTargets() {
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
    parseList(value) {
        return (value ?? '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }
};
exports.SeedService = SeedService;
exports.SeedService = SeedService = SeedService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.PrismaService,
        config_1.ConfigService])
], SeedService);
//# sourceMappingURL=seed.service.js.map