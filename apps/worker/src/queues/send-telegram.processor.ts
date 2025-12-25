import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TelegramService, formatSignalMessage, telegramTextJobSchema } from '@libs/telegram';
import { PrismaService } from '@libs/core';
import { SIGNALS_QUEUE_CONCURRENCY, SIGNALS_QUEUE_NAME } from '@libs/core';

interface TelegramDeliveryJob {
  deliveryId: string;
}

@Processor(SIGNALS_QUEUE_NAME, { concurrency: SIGNALS_QUEUE_CONCURRENCY })
export class SendTelegramProcessor extends WorkerHost {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly prismaService: PrismaService,
  ) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    if (job.name === 'sendTelegramDelivery') {
      const payload = job.data as TelegramDeliveryJob;
      await this.handleDelivery(payload);
      return;
    }

    if (job.name === 'sendTelegramText') {
      const payload = telegramTextJobSchema.parse(job.data);
      await this.telegramService.sendMessage(String(payload.chatId), payload.text, payload.parseMode);
    }
  }

  private async handleDelivery(payload: TelegramDeliveryJob): Promise<void> {
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

    const message = formatSignalMessage(updated.signal);
    const messageStyle = (updated.destination.messageStyle ?? {}) as { parseMode?: string };

    try {
      const messageId = await this.telegramService.sendMessage(
        updated.destination.chatId,
        message,
        messageStyle.parseMode,
      );
      await this.prismaService.signalDelivery.update({
        where: { id: payload.deliveryId },
        data: {
          status: 'SENT',
          telegramMessageId: messageId ? String(messageId) : undefined,
          error: null,
        },
      });
    } catch (error) {
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
}
