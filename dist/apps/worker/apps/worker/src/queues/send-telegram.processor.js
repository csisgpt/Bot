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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SendTelegramProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const telegram_1 = require("../../../../libs/telegram/src/index");
const core_1 = require("../../../../libs/core/src/index");
const core_2 = require("../../../../libs/core/src/index");
let SendTelegramProcessor = class SendTelegramProcessor extends bullmq_1.WorkerHost {
    constructor(telegramService, prismaService) {
        super();
        this.telegramService = telegramService;
        this.prismaService = prismaService;
    }
    async process(job) {
        if (job.name === 'sendTelegramDelivery') {
            const payload = job.data;
            await this.handleDelivery(payload);
            return;
        }
        if (job.name === 'sendTelegramText') {
            const payload = telegram_1.telegramTextJobSchema.parse(job.data);
            await this.telegramService.sendMessage(String(payload.chatId), payload.text, payload.parseMode);
        }
    }
    async handleDelivery(payload) {
        const delivery = await this.prismaService.signalDelivery.findUnique({
            where: { id: payload.deliveryId },
            include: { signal: true, destination: true },
        });
        if (!delivery) {
            return;
        }
        const updated = await this.prismaService.signalDelivery.update({
            where: { id: payload.deliveryId },
            data: { attempt: { increment: 1 } },
            include: { signal: true, destination: true },
        });
        if (updated.status === 'SENT') {
            return;
        }
        const message = (0, telegram_1.formatSignalMessage)(updated.signal);
        const messageStyle = (updated.destination.messageStyle ?? {});
        try {
            const messageId = await this.telegramService.sendMessage(updated.destination.chatId, message, messageStyle.parseMode);
            await this.prismaService.signalDelivery.update({
                where: { id: payload.deliveryId },
                data: {
                    status: 'SENT',
                    telegramMessageId: messageId ? String(messageId) : undefined,
                    error: null,
                },
            });
        }
        catch (error) {
            const messageError = error instanceof Error ? error.message : 'Unknown error';
            await this.prismaService.signalDelivery.update({
                where: { id: payload.deliveryId },
                data: {
                    status: 'FAILED',
                    error: messageError,
                },
            });
            throw error;
        }
    }
};
exports.SendTelegramProcessor = SendTelegramProcessor;
exports.SendTelegramProcessor = SendTelegramProcessor = __decorate([
    (0, bullmq_1.Processor)(core_2.SIGNALS_QUEUE_NAME, { concurrency: core_2.SIGNALS_QUEUE_CONCURRENCY }),
    __metadata("design:paramtypes", [telegram_1.TelegramService,
        core_1.PrismaService])
], SendTelegramProcessor);
//# sourceMappingURL=send-telegram.processor.js.map