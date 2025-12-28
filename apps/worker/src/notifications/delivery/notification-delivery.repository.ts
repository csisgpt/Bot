import { Injectable } from '@nestjs/common';
import { PrismaService } from '@libs/core';

export type NotificationDeliveryStatus = 'SENT' | 'SKIPPED' | 'FAILED';

@Injectable()
export class NotificationDeliveryRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async findExisting(entityType: string, entityId: string, chatId: string) {
    return this.prismaService.notificationDelivery.findUnique({
      where: {
        entityType_entityId_chatId: { entityType, entityId, chatId },
      },
    });
  }

  async createDelivery(params: {
    entityType: string;
    entityId: string;
    chatId: string;
    status: NotificationDeliveryStatus;
    reason?: string | null;
    providerMessageId?: string | null;
  }) {
    const { entityType, entityId, chatId, status, reason, providerMessageId } = params;
    return this.prismaService.notificationDelivery.create({
      data: {
        entityType,
        entityId,
        chatId,
        status,
        reason: reason ?? undefined,
        providerMessageId: providerMessageId ?? undefined,
      },
    });
  }

  async updateDeliveryStatus(params: {
    id: string;
    status: NotificationDeliveryStatus;
    reason?: string | null;
    providerMessageId?: string | null;
  }) {
    const { id, status, reason, providerMessageId } = params;
    return this.prismaService.notificationDelivery.update({
      where: { id },
      data: {
        status,
        reason: reason ?? undefined,
        providerMessageId: providerMessageId ?? undefined,
      },
    });
  }
}
