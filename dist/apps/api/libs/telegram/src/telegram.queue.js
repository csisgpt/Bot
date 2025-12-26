"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueTextMessage = exports.telegramTextJobSchema = void 0;
const zod_1 = require("zod");
exports.telegramTextJobSchema = zod_1.z.object({
    chatId: zod_1.z.union([zod_1.z.string().min(1), zod_1.z.number()]),
    text: zod_1.z.string().min(1),
    parseMode: zod_1.z.enum(['HTML', 'Markdown']).optional(),
});
const enqueueTextMessage = async (queue, chatId, text, parseMode) => {
    const payload = exports.telegramTextJobSchema.parse({ chatId, text, parseMode });
    await queue.add('sendTelegramText', payload, {
        removeOnComplete: true,
        removeOnFail: { count: 50 },
    });
};
exports.enqueueTextMessage = enqueueTextMessage;
//# sourceMappingURL=telegram.queue.js.map