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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const telegram_1 = require("../../../libs/telegram/src/index");
let AdminController = class AdminController {
    constructor(configService, telegramService) {
        this.configService = configService;
        this.telegramService = telegramService;
    }
    async testTelegram(ownerUserIdHeader, adminTokenHeader) {
        const ownerUserId = this.configService.get('TELEGRAM_OWNER_USER_ID') ??
            this.configService.get('OWNER_USER_ID');
        const adminToken = this.configService.get('ADMIN_TEST_TOKEN');
        const ownerMatch = Boolean(ownerUserId && ownerUserIdHeader === ownerUserId);
        const tokenMatch = Boolean(adminToken && adminTokenHeader === adminToken);
        if (!ownerMatch && !tokenMatch) {
            throw new common_1.HttpException('Unauthorized', common_1.HttpStatus.UNAUTHORIZED);
        }
        const message = `✅ Telegram test from API (${new Date().toISOString()}) I Love U`;
        await this.telegramService.sendTestMessage(message);
        return { ok: true };
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Post)('test-telegram'),
    __param(0, (0, common_1.Headers)('x-owner-user-id')),
    __param(1, (0, common_1.Headers)('x-admin-token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AdminController.prototype, "testTelegram", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('admin'),
    __metadata("design:paramtypes", [config_1.ConfigService,
        telegram_1.TelegramService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map