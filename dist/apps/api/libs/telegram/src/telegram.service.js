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
var TelegramService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TelegramService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const telegraf_1 = require("telegraf");
const telegram_formatter_1 = require("./telegram.formatter");
let TelegramService = TelegramService_1 = class TelegramService {
    constructor(configService) {
        this.logger = new common_1.Logger(TelegramService_1.name);
        const token = configService.get('TELEGRAM_BOT_TOKEN');
        if (!token) {
            throw new Error('TELEGRAM_BOT_TOKEN is required');
        }
        this.channelId = configService.get('TELEGRAM_SIGNAL_CHANNEL_ID', '');
        this.groupId = configService.get('TELEGRAM_SIGNAL_GROUP_ID', '');
        this.parseMode = configService.get('TELEGRAM_PARSE_MODE', 'HTML');
        this.disableWebPreview = configService.get('TELEGRAM_DISABLE_WEB_PAGE_PREVIEW', true);
        this.bot = new telegraf_1.Telegraf(token);
    }
    async sendTestMessage(message) {
        await this.sendMessageToDestinations(message);
    }
    async sendSignal(signal) {
        const message = (0, telegram_formatter_1.formatSignalMessage)(signal);
        await this.sendMessageToDestinations(message);
    }
    async sendMessage(chatId, message, parseMode) {
        const response = await this.bot.telegram.sendMessage(chatId, message, {
            parse_mode: parseMode ?? this.parseMode,
            disable_web_page_preview: this.disableWebPreview,
        });
        return response?.message_id;
    }
    async sendMessageToDestinations(message) {
        if (this.channelId) {
            await this.bot.telegram.sendMessage(this.channelId, message, {
                parse_mode: this.parseMode,
                disable_web_page_preview: this.disableWebPreview,
            });
        }
        if (this.groupId) {
            await this.bot.telegram.sendMessage(this.groupId, message, {
                parse_mode: this.parseMode,
                disable_web_page_preview: this.disableWebPreview,
            });
        }
        if (!this.channelId && !this.groupId) {
            this.logger.warn('No Telegram destination configured.');
        }
    }
};
exports.TelegramService = TelegramService;
exports.TelegramService = TelegramService = TelegramService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], TelegramService);
//# sourceMappingURL=telegram.service.js.map