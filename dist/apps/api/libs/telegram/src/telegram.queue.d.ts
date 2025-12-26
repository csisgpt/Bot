import { Queue } from 'bullmq';
import { z } from 'zod';
export declare const telegramTextJobSchema: z.ZodObject<{
    chatId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    text: z.ZodString;
    parseMode: z.ZodOptional<z.ZodEnum<["HTML", "Markdown"]>>;
}, "strip", z.ZodTypeAny, {
    text: string;
    chatId: string | number;
    parseMode?: "HTML" | "Markdown" | undefined;
}, {
    text: string;
    chatId: string | number;
    parseMode?: "HTML" | "Markdown" | undefined;
}>;
export type TelegramTextJobData = z.infer<typeof telegramTextJobSchema>;
export declare const enqueueTextMessage: (queue: Queue, chatId: TelegramTextJobData["chatId"], text: TelegramTextJobData["text"], parseMode?: TelegramTextJobData["parseMode"]) => Promise<void>;
