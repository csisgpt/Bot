import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@libs/core';
import { AssetType, TelegramDestinationType } from '@prisma/client';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const enabled = this.configService.get<boolean>('SEED_ON_STARTUP', true);
    if (!enabled) {
      return;
    }

    await this.seed();
  }

  async seed(): Promise<{ strategies: number; instruments: number; destinations: number; rules: number }> {
    const strategyKey = this.configService.get<string>('DEFAULT_STRATEGY_KEY', 'default');
    const strategyName = this.configService.get<string>('DEFAULT_STRATEGY_NAME', 'Default');
    const strategy = await this.prismaService.strategy.upsert({
      where: { key: strategyKey },
      create: { key: strategyKey, name: strategyName, isActive: true },
      update: { name: strategyName, isActive: true },
    });

    const instruments = await this.ensureInstruments();
    const destinations = await this.ensureDestinations();
    const rules = await this.ensureRoutingRules(destinations);

    this.logger.log(
      `Seed completed: ${instruments.length} instruments, ${destinations.length} destinations, ${rules} rules, strategy ${strategy.key}.`,
    );

    return {
      strategies: 1,
      instruments: instruments.length,
      destinations: destinations.length,
      rules,
    };
  }

  private async ensureInstruments() {
    const targets: Array<{ assetType: AssetType; symbol: string }> = [];
    const goldSymbols = this.parseList(
      this.configService.get<string>('GOLD_INSTRUMENTS', 'XAUTUSDT'),
    );
    const cryptoSymbols = this.parseList(
      this.configService.get<string>('CRYPTO_INSTRUMENTS', ''),
    );
    const legacySymbols = this.parseList(
      this.configService.get<string>('BINANCE_SYMBOLS', ''),
    );

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

    const instruments = await this.prismaService.$transaction(
      targets.map((target) =>
        this.prismaService.instrument.upsert({
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
        }),
      ),
    );

    return instruments;
  }

  private async ensureDestinations() {
    const destinations = this.getDestinationTargets();
    if (destinations.length === 0) {
      return [];
    }

    return this.prismaService.$transaction(
      destinations.map((destination) =>
        this.prismaService.telegramDestination.upsert({
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
        }),
      ),
    );
  }

  private async ensureRoutingRules(destinations: Array<{ id: string }>): Promise<number> {
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

  private getDestinationTargets(): Array<{
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

  private parseList(value?: string): string[] {
    return (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
