import { Queue } from 'bullmq';
import { z } from 'zod';

export const telegramTextJobSchema = z.object({
  chatId: z.union([z.string().min(1), z.number()]),
  text: z.string().min(1),
  parseMode: z.enum(['HTML', 'Markdown']).optional(),
  notificationDeliveryId: z.string().min(1).optional(),
});

export type TelegramTextJobData = z.infer<typeof telegramTextJobSchema>;

export const enqueueTextMessage = async (
  queue: Queue,
  chatId: TelegramTextJobData['chatId'],
  text: TelegramTextJobData['text'],
  parseMode?: TelegramTextJobData['parseMode'],
): Promise<void> => {
  const payload = telegramTextJobSchema.parse({ chatId, text, parseMode });
  await queue.add('sendTelegramText', payload, {
    removeOnComplete: true,
    removeOnFail: { count: 50 },
  });
};
