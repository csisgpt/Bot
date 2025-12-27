import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@libs/core';
import { formatSignalDetailsMessage } from '@libs/telegram';
import { ChatConfig, ChatType } from '@prisma/client';
import { Markup, Telegraf } from 'telegraf';
import type { ParseMode } from 'telegraf/types';

interface PendingAction {
  type: 'watchlist_add' | 'quiet_hours';
  chatId: number;
  userId: number;
  promptMessageId: number;
  expiresAt: number;
}

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly bot: Telegraf;
  private readonly parseMode: ParseMode;
  private readonly pendingActions = new Map<string, PendingAction>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    const pm = (this.configService.get<string>('TELEGRAM_PARSE_MODE', 'HTML') || 'HTML').toUpperCase();
    this.parseMode =
      pm === 'MARKDOWN' || pm === 'MARKDOWNV2' || pm === 'HTML'
        ? (pm as ParseMode)
        : 'HTML';

    this.bot = new Telegraf(token);
    this.registerHandlers();
  }

  async onModuleInit(): Promise<void> {
    const usePolling = this.configService.get<boolean>('TELEGRAM_USE_POLLING', false);
    if (usePolling) {
      await this.bot.launch();
      this.logger.log('Telegram bot polling started.');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.bot.stop();
  }

  async handleUpdate(update: unknown): Promise<void> {
    await this.bot.handleUpdate(update as any);
  }

  private registerHandlers(): void {
    this.bot.start(async (ctx) => {
      await this.ensureChatConfig(ctx.chat);
      await ctx.reply(
        this.escapeHtml('Welcome! Use /menu to explore signals, watchlists, and settings.'),
        { parse_mode: this.parseMode },
      );
      await this.showMenu(ctx.chat.id);
    });

    this.bot.command('menu', async (ctx) => {
      await this.ensureChatConfig(ctx.chat);
      await this.showMenu(ctx.chat.id);
    });

    this.bot.command('help', async (ctx) => {
      await this.ensureChatConfig(ctx.chat);
      await ctx.reply(this.renderHelp(), { parse_mode: this.parseMode });
    });

    this.bot.command('status', async (ctx) => {
      const chatConfig = await this.ensureChatConfig(ctx.chat);
      await ctx.reply(this.renderStatus(chatConfig), { parse_mode: this.parseMode });
    });

    this.bot.on('callback_query', async (ctx) => {
      const cbq = ctx.callbackQuery;
      const data = cbq && 'data' in cbq ? cbq.data : '';
      const chatId =
        ctx.chat?.id ??
        (cbq && 'message' in cbq ? cbq.message?.chat?.id : undefined);

      if (!chatId) {
        // در بعضی آپدیت‌ها (rare) ممکنه chatId نداشته باشیم
        this.logger.warn('Telegram callback without chatId');
        return;
      }
      if (typeof data !== 'string') return;

      const chatConfig = await this.ensureChatConfig(ctx.chat);
      const parts = data.split(':');
      const [prefix, action, id, option] = parts;

      switch (prefix) {
        case 'm':
          await this.handleMenuAction(chatId, action, chatConfig);
          break;
        case 'w':
          await this.handleWatchlistAction(chatId, action, id, chatConfig, ctx.from?.id);
          break;
        case 's':
          await this.handleSettingsAction(chatId, action, id, option, chatConfig, ctx.from?.id);
          break;
        case 'sig':
          await this.handleSignalAction(chatId, action, id, option, chatConfig, ctx.from?.id);
          break;
        case 'a':
          await this.handleAlertsMenu(chatId);
          break;
        case 'd':
          await this.handleDigestMenu(chatId);
          break;
        default:
          break;
      }

      await ctx.answerCbQuery();
    });

    this.bot.on('text', async (ctx) => {
      const chatId = ctx.chat.id;
      const userId = ctx.from?.id;
      if (!userId) return;

      const key = this.pendingKey(chatId, userId);
      const pending = this.pendingActions.get(key);
      if (!pending) return;

      const replyToId = ctx.message.reply_to_message?.message_id;
      if (!replyToId || replyToId !== pending.promptMessageId) return;

      if (Date.now() > pending.expiresAt) {
        this.pendingActions.delete(key);
        await this.bot.telegram.sendMessage(chatId, this.escapeHtml('This prompt expired. Please try again.'), {
          parse_mode: this.parseMode,
        });
        return;
      }

      if (pending.type === 'watchlist_add') {
        await this.handleManualWatchlistAdd(ctx.chat, ctx.message.text);
      }

      if (pending.type === 'quiet_hours') {
        await this.handleQuietHoursInput(ctx.chat, ctx.message.text);
      }

      this.pendingActions.delete(key);
    });
  }

  private async handleMenuAction(chatId: number, action: string, chatConfig: ChatConfig): Promise<void> {
    switch (action) {
      case 'main':
        await this.showMenu(chatId);
        return;
      case 'signals':
        await this.bot.telegram.sendMessage(
          chatId,
          this.escapeHtml('Signals are running. Use /status to see current filters.'),
          { parse_mode: this.parseMode },
        );
        return;
      case 'help':
        await this.bot.telegram.sendMessage(chatId, this.renderHelp(), { parse_mode: this.parseMode });
        return;
      case 'status':
        await this.bot.telegram.sendMessage(chatId, this.renderStatus(chatConfig), {
          parse_mode: this.parseMode,
        });
        return;
      default:
        return;
    }
  }

  private async handleWatchlistAction(
    chatId: number,
    action: string,
    id: string | undefined,
    chatConfig: ChatConfig,
    userId?: number,
  ): Promise<void> {
    const isAllowed = await this.ensureAdmin(chatId, userId, chatConfig);
    if (!isAllowed) return;

    if (action === 'list') {
      await this.showWatchlist(chatId, chatConfig);
      return;
    }

    if (action === 'add') {
      if (id === 'manual') {
        if (!userId) return;
        const response = await this.bot.telegram.sendMessage(
          chatId,
          this.escapeHtml('Send the symbol (e.g. BTCUSDT).'),
          { parse_mode: this.parseMode, reply_markup: { force_reply: true } },
        );
        this.pendingActions.set(this.pendingKey(chatId, userId), {
          type: 'watchlist_add',
          chatId,
          userId,
          promptMessageId: response.message_id,
          expiresAt: Date.now() + 2 * 60 * 1000,
        });
        return;
      }

      if (id) {
        await this.updateWatchlist(chatId, chatConfig, id, true);
        return;
      }
    }

    if (action === 'rm' && id) {
      await this.updateWatchlist(chatId, chatConfig, id, false);
    }
  }

  private async handleSettingsAction(
    chatId: number,
    action: string,
    id: string | undefined,
    option: string | undefined,
    chatConfig: ChatConfig,
    userId?: number,
  ): Promise<void> {
    const isAllowed = await this.ensureAdmin(chatId, userId, chatConfig);
    if (!isAllowed) return;

    if (action === 'menu') {
      await this.showSettingsMenu(chatId, chatConfig);
      return;
    }

    if (action === 'min' && id) {
      const minConfidence = Number(id);
      if ([60, 70, 80].includes(minConfidence)) {
        await this.prismaService.chatConfig.update({
          where: { chatId: String(chatId) },
          data: { minConfidence },
        });
        const updated = await this.prismaService.chatConfig.findUnique({
          where: { chatId: String(chatId) },
        });
        if (updated) {
          await this.showSettingsMenu(chatId, updated);
        }
      }
      return;
    }

    if (action === 'tf' && id) {
      const timeframes = new Set(chatConfig.timeframes);
      if (timeframes.has(id)) {
        timeframes.delete(id);
      } else {
        timeframes.add(id);
      }
      const updated = await this.prismaService.chatConfig.update({
        where: { chatId: String(chatId) },
        data: { timeframes: Array.from(timeframes) },
      });
      await this.showSettingsMenu(chatId, updated);
      return;
    }

    if (action === 'asset' && id) {
      const assets = new Set(chatConfig.assetsEnabled.map((item) => item.toUpperCase()));
      const normalized = id.toUpperCase();
      if (assets.has(normalized)) {
        assets.delete(normalized);
      } else {
        assets.add(normalized);
      }
      const updated = await this.prismaService.chatConfig.update({
        where: { chatId: String(chatId) },
        data: { assetsEnabled: Array.from(assets) },
      });
      await this.showSettingsMenu(chatId, updated);
      return;
    }

    if (action === 'dest' && id) {
      const updated =
        id === 'channel'
          ? await this.prismaService.chatConfig.update({
            where: { chatId: String(chatId) },
            data: { sendToChannel: !chatConfig.sendToChannel },
          })
          : await this.prismaService.chatConfig.update({
            where: { chatId: String(chatId) },
            data: { sendToGroup: !chatConfig.sendToGroup },
          });
      await this.showSettingsMenu(chatId, updated);
      return;
    }

    if (action === 'quiet' && id === 'toggle') {
      const updated = await this.prismaService.chatConfig.update({
        where: { chatId: String(chatId) },
        data: { quietHoursEnabled: !chatConfig.quietHoursEnabled },
      });
      await this.showSettingsMenu(chatId, updated);
      return;
    }

    if (action === 'quiet' && id === 'set') {
      if (!userId) return;
      const response = await this.bot.telegram.sendMessage(
        chatId,
        this.escapeHtml('Send quiet hours in UTC (e.g. 22:00-06:00).'),
        { parse_mode: this.parseMode, reply_markup: { force_reply: true } },
      );
      this.pendingActions.set(this.pendingKey(chatId, userId), {
        type: 'quiet_hours',
        chatId,
        userId,
        promptMessageId: response.message_id,
        expiresAt: Date.now() + 2 * 60 * 1000,
      });
      return;
    }

    if (action === 'back') {
      await this.showMenu(chatId);
    }
  }

  private async handleSignalAction(
    chatId: number,
    action: string,
    id: string | undefined,
    option: string | undefined,
    chatConfig: ChatConfig,
    userId?: number,
  ): Promise<void> {
    if (!id) return;

    if (action === 'd') {
      const signal = await this.prismaService.signal.findUnique({ where: { id } });
      if (!signal) {
        await this.bot.telegram.sendMessage(chatId, this.escapeHtml('Signal not found.'), {
          parse_mode: this.parseMode,
        });
        return;
      }
      await this.bot.telegram.sendMessage(chatId, formatSignalDetailsMessage({
        id: signal.id,
        source: signal.source,
        assetType: signal.assetType as any,
        instrument: signal.instrument,
        interval: signal.interval,
        strategy: signal.strategy,
        kind: signal.kind as any,
        side: signal.side as any,
        price: signal.price,
        time: signal.time.getTime(),
        confidence: signal.confidence,
        tags: signal.tags,
        reason: signal.reason,
        why: signal.why ?? undefined,
        indicators: (signal.indicators ?? undefined) as Record<string, any> | undefined,
        levels: (signal.levels ?? undefined) as any,
        sl: signal.sl ?? undefined,
        tp1: signal.tp1 ?? undefined,
        tp2: signal.tp2 ?? undefined,
        externalId: signal.externalId ?? undefined,
        rawPayload: signal.rawPayload ?? undefined,
      }), { parse_mode: this.parseMode });
      return;
    }

    if (action === 'a') {
      if (!option) {
        await this.bot.telegram.sendMessage(chatId, this.escapeHtml('Choose an alert:'), {
          parse_mode: this.parseMode,
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.callback('+0.5%', `sig:a:${id}:up05`),
              Markup.button.callback('-0.5%', `sig:a:${id}:down05`),
            ],
            [Markup.button.callback('TP1', `sig:a:${id}:tp1`)],
          ]).reply_markup,
        });
        return;
      }

      await this.createAlertFromSignal(chatId, id, option, userId);
      return;
    }

    if (action === 'w') {
      const isAllowed = await this.ensureAdmin(chatId, userId, chatConfig);
      if (!isAllowed) return;
      const signal = await this.prismaService.signal.findUnique({ where: { id } });
      if (!signal) return;
      await this.updateWatchlist(chatId, chatConfig, signal.instrument, undefined);
      return;
    }

    if (action === 'm') {
      if (!option) {
        await this.bot.telegram.sendMessage(chatId, this.escapeHtml('Mute options:'), {
          parse_mode: this.parseMode,
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('Mute instrument 1h', `sig:m:${id}:instrument`)],
            [Markup.button.callback('Mute all 1h', `sig:m:${id}:all`)],
          ]).reply_markup,
        });
        return;
      }

      await this.applyMute(chatId, id, option, chatConfig);
    }
  }

  private async handleAlertsMenu(chatId: number): Promise<void> {
    await this.bot.telegram.sendMessage(
      chatId,
      this.escapeHtml('Tap “Alert” under a signal to create quick alerts.'),
      { parse_mode: this.parseMode },
    );
  }

  private async handleDigestMenu(chatId: number): Promise<void> {
    await this.bot.telegram.sendMessage(
      chatId,
      this.escapeHtml('Daily report will arrive automatically at the configured time.'),
      { parse_mode: this.parseMode },
    );
  }

  private async handleManualWatchlistAdd(chat: any, text: string): Promise<void> {
    const symbol = text.trim().toUpperCase();
    if (!symbol) return;
    const chatConfig = await this.ensureChatConfig(chat);
    await this.updateWatchlist(chat.id, chatConfig, symbol, true);
  }

  private async handleQuietHoursInput(chat: any, text: string): Promise<void> {
    const value = text.trim();
    if (!/^[0-2]\d:[0-5]\d-[0-2]\d:[0-5]\d$/.test(value)) {
      await this.bot.telegram.sendMessage(chat.id, this.escapeHtml('Invalid format. Use HH:MM-HH:MM.'), {
        parse_mode: this.parseMode,
      });
      return;
    }

    const [start, end] = value.split('-');
    const updated = await this.prismaService.chatConfig.update({
      where: { chatId: String(chat.id) },
      data: { quietHoursStart: start, quietHoursEnd: end, quietHoursEnabled: true },
    });
    await this.showSettingsMenu(chat.id, updated);
  }

  private async createAlertFromSignal(
    chatId: number,
    signalId: string,
    option: string,
    userId?: number,
  ): Promise<void> {
    if (!userId) return;
    const signal = await this.prismaService.signal.findUnique({ where: { id: signalId } });
    if (!signal) return;
    const basePrice = signal.price ?? undefined;

    if (option === 'tp1' && signal.tp1 == null) {
      await this.bot.telegram.sendMessage(chatId, this.escapeHtml('TP1 not available for this signal.'), {
        parse_mode: this.parseMode,
      });
      return;
    }

    if ((option === 'up05' || option === 'down05') && basePrice == null) {
      await this.bot.telegram.sendMessage(chatId, this.escapeHtml('Price unavailable for this signal.'), {
        parse_mode: this.parseMode,
      });
      return;
    }

    const alertData =
      option === 'up05'
        ? { type: 'UP_PCT' as const, threshold: 0.5, basePrice }
        : option === 'down05'
          ? { type: 'DOWN_PCT' as const, threshold: 0.5, basePrice }
          : { type: 'TP1' as const, threshold: signal.tp1 ?? undefined, basePrice };

    await this.prismaService.alertRule.create({
      data: {
        userId: String(userId),
        chatId: String(chatId),
        instrument: signal.instrument,
        type: alertData.type,
        threshold: alertData.threshold,
        basePrice: alertData.basePrice,
      },
    });

    await this.bot.telegram.sendMessage(chatId, this.escapeHtml('Alert saved ✅'), { parse_mode: this.parseMode });
  }

  private async applyMute(
    chatId: number,
    signalId: string,
    option: string,
    chatConfig: ChatConfig,
  ): Promise<void> {
    const muteUntil = new Date(Date.now() + 60 * 60 * 1000);
    const mutedInstruments = new Set(chatConfig.mutedInstruments);

    if (option === 'instrument') {
      const signal = await this.prismaService.signal.findUnique({ where: { id: signalId } });
      if (signal) {
        mutedInstruments.add(signal.instrument);
      }
    }

    if (option === 'all') {
      mutedInstruments.clear();
    }

    await this.prismaService.chatConfig.update({
      where: { chatId: String(chatId) },
      data: {
        mutedUntil: muteUntil,
        mutedInstruments: Array.from(mutedInstruments),
      },
    });

    await this.bot.telegram.sendMessage(chatId, this.escapeHtml('Muted for 1 hour.'), {
      parse_mode: this.parseMode,
    });
  }

  private async showMenu(chatId: number): Promise<void> {
    await this.bot.telegram.sendMessage(chatId, this.escapeHtml('Main menu:'), {
      parse_mode: this.parseMode,
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback('📡 Signals', 'm:signals'),
          Markup.button.callback('⭐ Watchlist', 'w:list'),
        ],
        [
          Markup.button.callback('🔔 Alerts', 'a:menu'),
          Markup.button.callback('⚙️ Group Settings', 's:menu'),
        ],
        [
          Markup.button.callback('🧾 Today Report', 'd:today'),
          Markup.button.callback('🆘 Help', 'm:help'),
        ],
      ]).reply_markup,
    });
  }

  private async showWatchlist(chatId: number, chatConfig: ChatConfig): Promise<void> {
    const list = chatConfig.watchlist.length > 0 ? chatConfig.watchlist.join(', ') : 'empty';
    const popular = this.getPopularInstruments();
    const buttons = popular.map((symbol) => Markup.button.callback(symbol, `w:add:${symbol}`));

    await this.bot.telegram.sendMessage(chatId, this.escapeHtml(`Watchlist: ${list}`), {
      parse_mode: this.parseMode,
      reply_markup: Markup.inlineKeyboard([
        buttons.slice(0, 2),
        buttons.slice(2, 4),
        [Markup.button.callback('➕ Add manually', 'w:add:manual')],
        ...(chatConfig.watchlist.length > 0
          ? chatConfig.watchlist.map((symbol) => [Markup.button.callback(`Remove ${symbol}`, `w:rm:${symbol}`)])
          : []),
        [Markup.button.callback('⬅️ Back', 'm:main')],
      ]).reply_markup,
    });
  }

  private async showSettingsMenu(chatId: number, chatConfig: ChatConfig): Promise<void> {
    await this.bot.telegram.sendMessage(chatId, this.renderStatus(chatConfig), {
      parse_mode: this.parseMode,
      reply_markup: Markup.inlineKeyboard([
        [
          Markup.button.callback('Min 60', 's:min:60'),
          Markup.button.callback('Min 70', 's:min:70'),
          Markup.button.callback('Min 80', 's:min:80'),
        ],
        [
          Markup.button.callback('15m', 's:tf:15m'),
          Markup.button.callback('1h', 's:tf:1h'),
        ],
        [
          Markup.button.callback('Quiet hours on/off', 's:quiet:toggle'),
          Markup.button.callback('Set quiet hours', 's:quiet:set'),
        ],
        [
          Markup.button.callback('Toggle group', 's:dest:group'),
          Markup.button.callback('Toggle channel', 's:dest:channel'),
        ],
        [
          Markup.button.callback('GOLD', 's:asset:GOLD'),
          Markup.button.callback('CRYPTO', 's:asset:CRYPTO'),
        ],
        [Markup.button.callback('⬅️ Back', 'm:main')],
      ]).reply_markup,
    });
  }

  private renderHelp(): string {
    return [
      '🆘 <b>Help</b>',
      '• /menu — open the main menu',
      '• /status — show chat configuration',
      '• Use buttons under a signal for details, alerts, watchlist, or mute.',
    ].join('\n');
  }

  private renderStatus(chatConfig: ChatConfig): string {
    const assets = chatConfig.assetsEnabled.length > 0 ? chatConfig.assetsEnabled.join(', ') : 'default';
    const timeframes = chatConfig.timeframes.length > 0 ? chatConfig.timeframes.join(', ') : 'default';
    const watchlist = chatConfig.watchlist.length > 0 ? chatConfig.watchlist.join(', ') : 'default';
    const quiet = chatConfig.quietHoursEnabled
      ? `${chatConfig.quietHoursStart ?? '??'}-${chatConfig.quietHoursEnd ?? '??'} UTC`
      : 'off';

    return [
      '⚙️ <b>Chat settings</b>',
      `<b>Enabled:</b> ${chatConfig.isEnabled ? 'yes' : 'no'}`,
      `<b>Assets:</b> ${this.escapeHtml(assets)}`,
      `<b>Timeframes:</b> ${this.escapeHtml(timeframes)}`,
      `<b>Watchlist:</b> ${this.escapeHtml(watchlist)}`,
      `<b>Min confidence:</b> ${chatConfig.minConfidence}%`,
      `<b>Quiet hours:</b> ${this.escapeHtml(quiet)}`,
      `<b>Send to group:</b> ${chatConfig.sendToGroup ? 'on' : 'off'}`,
      `<b>Send to channel:</b> ${chatConfig.sendToChannel ? 'on' : 'off'}`,
    ].join('\n');
  }

  private async updateWatchlist(
    chatId: number,
    chatConfig: ChatConfig,
    symbol: string,
    forceAdd?: boolean,
  ): Promise<void> {
    const normalized = symbol.toUpperCase();
    const watchlist = new Set(chatConfig.watchlist.map((item) => item.toUpperCase()));

    if (forceAdd === undefined) {
      if (watchlist.has(normalized)) {
        watchlist.delete(normalized);
      } else {
        watchlist.add(normalized);
      }
    } else if (forceAdd) {
      watchlist.add(normalized);
    } else {
      watchlist.delete(normalized);
    }

    const updated = await this.prismaService.chatConfig.update({
      where: { chatId: String(chatId) },
      data: { watchlist: Array.from(watchlist) },
    });

    await this.showWatchlist(chatId, updated);
  }

  private getPopularInstruments(): string[] {
    const gold = this.configService.get<string>('GOLD_INSTRUMENTS', 'XAUTUSDT')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const crypto = this.configService.get<string>('CRYPTO_INSTRUMENTS', 'BTCUSDT,ETHUSDT')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    return Array.from(new Set([...gold, ...crypto])).slice(0, 6);
  }

  private async ensureChatConfig(chat?: any): Promise<ChatConfig> {
    const chatId = String(chat?.id ?? '');
    const chatType = this.resolveChatType(chat?.type);
    const title = chat?.title ?? `${chat?.first_name ?? ''} ${chat?.last_name ?? ''}`.trim();

    const existing = await this.prismaService.chatConfig.findUnique({ where: { chatId } });
    if (existing) {
      return this.prismaService.chatConfig.update({
        where: { chatId },
        data: { chatType, title },
      });
    }

    return this.prismaService.chatConfig.create({
      data: {
        chatId,
        chatType,
        title,
        assetsEnabled: [],
        timeframes: [],
        watchlist: [],
        mutedInstruments: [],
      },
    });
  }

  private resolveChatType(type?: string): ChatType {
    if (type === 'private') return 'private';
    if (type === 'channel') return 'channel';
    return 'group';
  }

  private async ensureAdmin(chatId: number, userId: number | undefined, chatConfig: ChatConfig): Promise<boolean> {
    const adminOnly = this.configService.get<boolean>('TELEGRAM_ADMIN_ONLY_GROUP_SETTINGS', true);
    if (!adminOnly) return true;

    if (chatConfig.chatType === 'private') return true;
    if (!userId) return false;

    try {
      const member = await this.bot.telegram.getChatMember(chatId, userId);
      const allowed = member.status === 'creator' || member.status === 'administrator';
      if (!allowed) {
        await this.bot.telegram.sendMessage(
          chatId,
          this.escapeHtml('Only group admins can change watchlist or settings.'),
          { parse_mode: this.parseMode },
        );
      }
      return allowed;
    } catch (error) {
      this.logger.warn(`Failed to check admin status: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private pendingKey(chatId: number, userId: number): string {
    return `${chatId}:${userId}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
