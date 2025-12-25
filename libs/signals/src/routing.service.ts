import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@libs/core';
import {
  AssetType,
  RoutingRule,
  TelegramDestination,
  TelegramDestinationType,
} from '@prisma/client';
import { Signal } from './types';

export interface RoutingContext {
  instrumentId?: string | null;
  strategyId?: string | null;
}

export const matchesRoutingRule = (
  rule: Pick<RoutingRule, 'assetType' | 'instrumentId' | 'strategyId' | 'interval' | 'minConfidence'>,
  signal: Signal,
  context: RoutingContext,
): boolean => {
  if (rule.assetType && rule.assetType !== (signal.assetType as AssetType)) {
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

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async resolveDestinations(signal: Signal): Promise<TelegramDestination[]> {
    const [instrument, strategy, rules] = await Promise.all([
      this.prismaService.instrument.findFirst({
        where: {
          symbol: signal.instrument,
          assetType: signal.assetType as AssetType,
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

    const context: RoutingContext = {
      instrumentId: instrument?.id ?? null,
      strategyId: strategy?.id ?? null,
    };

    const destinations = rules
      .filter((rule) => matchesRoutingRule(rule, signal, context))
      .map((rule) => rule.destination);

    const unique = new Map<string, TelegramDestination>();
    for (const destination of destinations) {
      unique.set(destination.id, destination);
    }

    return Array.from(unique.values());
  }

  private async ensureFallbackDestinations(): Promise<TelegramDestination[]> {
    const fallbackTargets = this.getFallbackTargets();
    if (fallbackTargets.length === 0) {
      this.logger.warn('No routing rules or fallback Telegram destinations configured.');
      return [];
    }

    const destinations = await this.prismaService.$transaction(
      fallbackTargets.map((target) =>
        this.prismaService.telegramDestination.upsert({
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
        }),
      ),
    );

    return destinations;
  }

  private getFallbackTargets(): Array<{
    destinationType: TelegramDestinationType;
    chatId: string;
    title?: string;
  }> {
    const targets: Array<{
      destinationType: TelegramDestinationType;
      chatId: string;
      title?: string;
    }> = [];

    const directChatId = this.configService.get<string>('TELEGRAM_CHAT_ID', '').trim();
    const directType = this.configService.get<string>('TELEGRAM_CHAT_TYPE', 'GROUP');
    if (directChatId) {
      targets.push({
        destinationType: directType.toUpperCase() === 'CHANNEL' ? 'CHANNEL' : 'GROUP',
        chatId: directChatId,
      });
    }

    const channelId = this.configService.get<string>('TELEGRAM_SIGNAL_CHANNEL_ID', '').trim();
    if (channelId) {
      targets.push({
        destinationType: 'CHANNEL',
        chatId: channelId,
        title: this.configService.get<string>('TELEGRAM_SIGNAL_CHANNEL_TITLE', undefined),
      });
    }

    const groupId = this.configService.get<string>('TELEGRAM_SIGNAL_GROUP_ID', '').trim();
    if (groupId) {
      targets.push({
        destinationType: 'GROUP',
        chatId: groupId,
        title: this.configService.get<string>('TELEGRAM_SIGNAL_GROUP_TITLE', undefined),
      });
    }

    return targets;
  }
}
