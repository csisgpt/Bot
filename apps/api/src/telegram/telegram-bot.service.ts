import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@libs/core';
import { formatSignalDetailsMessage } from '@libs/telegram';
import { ChatConfig, ChatType } from '@prisma/client';
import { Markup, Telegraf } from 'telegraf';
import type { ParseMode } from 'telegraf/types';
import { faMessages } from './fa.messages';

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
      try {
        const chat = ctx.chat;
        if (!chat) return;
        await this.ensureChatConfig(chat);
        await ctx.reply(this.escapeHtml(faMessages.welcome), { parse_mode: this.parseMode });
        await this.showMenu(chat.id);
      } catch (error) {
        this.logger.error(`Start handler failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    this.bot.command('menu', async (ctx) => {
      try {
        const chat = ctx.chat;
        if (!chat) return;
        await this.ensureChatConfig(chat);
        await this.showMenu(chat.id);
      } catch (error) {
        this.logger.error(`Menu handler failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    this.bot.command('help', async (ctx) => {
      try {
        const chat = ctx.chat;
        if (!chat) return;
        await this.ensureChatConfig(chat);
        await ctx.reply(this.renderHelp(), { parse_mode: this.parseMode });
      } catch (error) {
        this.logger.error(`Help handler failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    this.bot.command('status', async (ctx) => {
      try {
        const chat = ctx.chat;
        if (!chat) return;
        const chatConfig = await this.ensureChatConfig(chat);
        await ctx.reply(this.renderStatus(chatConfig), { parse_mode: this.parseMode });
      } catch (error) {
        this.logger.error(`Status handler failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    this.bot.on('callback_query', async (ctx) => {
      try {
        await ctx.answerCbQuery();
      } catch (error) {
        this.logger.warn(`Failed to answer callback query: ${error instanceof Error ? error.message : String(error)}`);
      }

      const cbq = ctx.callbackQuery;
      const data = cbq && 'data' in cbq ? cbq.data : '';
      const chat = ctx.chat ?? (cbq && 'message' in cbq ? cbq.message?.chat : undefined);
      const chatId = chat?.id;

      if (!chatId) {
        this.logger.warn(faMessages.errors.noChatId);
        return;
      }
      if (typeof data !== 'string') return;

      try {
        const chatConfig = await this.ensureChatConfig(chat);
        const parts = data.split(':');
        const [prefix, action, id, option] = parts;

        switch (prefix) {
          case 'm':
            await this.handleMenuAction(chatId, action, chatConfig, ctx);
            break;
          case 'w':
            await this.handleWatchlistAction(chatId, action, id, chatConfig, ctx.from?.id, ctx);
            break;
          case 's':
            await this.handleSettingsAction(chatId, action, id, option, chatConfig, ctx.from?.id, ctx);
            break;
          case 'sig':
            await this.handleSignalAction(chatId, action, id, option, chatConfig, ctx.from?.id);
            break;
          case 'a':
            await this.handleAlertsMenu(chatId, ctx);
            break;
          case 'd':
            await this.handleDigestMenu(chatId, ctx);
            break;
          default:
            break;
        }
      } catch (error) {
        this.logger.error(`Callback handler failed: ${error instanceof Error ? error.message : String(error)}`);
        await this.safeSendMessage(chatId, faMessages.errors.temporary);
      }
    });

    this.bot.on('text', async (ctx) => {
      try {
        const chatId = ctx.chat?.id;
        const userId = ctx.from?.id;
        if (!chatId || !userId) return;

        const key = this.pendingKey(chatId, userId);
        const pending = this.pendingActions.get(key);
        if (!pending) return;

        const replyToId = ctx.message.reply_to_message?.message_id;
        if (!replyToId || replyToId !== pending.promptMessageId) return;

        if (Date.now() > pending.expiresAt) {
          this.pendingActions.delete(key);
          await this.safeSendMessage(chatId, faMessages.errors.promptExpired);
          return;
        }

        if (pending.type === 'watchlist_add') {
          await this.handleManualWatchlistAdd(ctx.chat, ctx.message.text);
        }

        if (pending.type === 'quiet_hours') {
          await this.handleQuietHoursInput(ctx.chat, ctx.message.text);
        }

        this.pendingActions.delete(key);
      } catch (error) {
        this.logger.error(`Text handler failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }

  private async handleMenuAction(
    chatId: number,
    action: string,
    chatConfig: ChatConfig,
    ctx?: any,
  ): Promise<void> {
    switch (action) {
      case 'main':
        await this.showMenu(chatId, ctx);
        return;
      case 'signals':
        await this.showSignalsPanel(chatId, ctx);
        return;
      case 'help':
        await this.showHelpPanel(chatId, ctx);
        return;
      case 'status':
        await this.showStatusPanel(chatId, chatConfig, ctx);
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
    ctx?: any,
  ): Promise<void> {
    const isAllowed = await this.ensureAdmin(chatId, userId, chatConfig);
    if (!isAllowed) return;

    if (action === 'list') {
      await this.showWatchlist(chatId, chatConfig, ctx);
      return;
    }

    if (action === 'add') {
      if (id === 'manual') {
        if (!userId) return;
        const response = await this.bot.telegram.sendMessage(
          chatId,
          this.escapeHtml(faMessages.watchlist.manualPrompt),
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
        await this.updateWatchlist(chatId, chatConfig, id, undefined, ctx);
        return;
      }
    }

    if (action === 'rm' && id) {
      await this.updateWatchlist(chatId, chatConfig, id, false, ctx);
    }
  }

  private async handleSettingsAction(
    chatId: number,
    action: string,
    id: string | undefined,
    option: string | undefined,
    chatConfig: ChatConfig,
    userId?: number,
    ctx?: any,
  ): Promise<void> {
    const isAllowed = await this.ensureAdmin(chatId, userId, chatConfig);
    if (!isAllowed) return;

    if (action === 'menu') {
      await this.showSettingsMenu(chatId, chatConfig, ctx);
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
          await this.showSettingsMenu(chatId, updated, ctx);
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
      await this.showSettingsMenu(chatId, updated, ctx);
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
      await this.showSettingsMenu(chatId, updated, ctx);
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
      await this.showSettingsMenu(chatId, updated, ctx);
      return;
    }

    if (action === 'quiet' && id === 'toggle') {
      const updated = await this.prismaService.chatConfig.update({
        where: { chatId: String(chatId) },
        data: { quietHoursEnabled: !chatConfig.quietHoursEnabled },
      });
      await this.showSettingsMenu(chatId, updated, ctx);
      return;
    }

    if (action === 'quiet' && id === 'set') {
      if (!userId) return;
      const response = await this.bot.telegram.sendMessage(
        chatId,
        this.escapeHtml(faMessages.quietHours.prompt),
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
      await this.showMenu(chatId, ctx);
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
        await this.bot.telegram.sendMessage(chatId, this.escapeHtml(faMessages.errors.signalNotFound), {
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
        await this.bot.telegram.sendMessage(chatId, this.escapeHtml(faMessages.alerts.choose), {
          parse_mode: this.parseMode,
          reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.callback('٪۰٫۵+', `sig:a:${id}:up05`),
              Markup.button.callback('٪۰٫۵-', `sig:a:${id}:down05`),
            ],
            [Markup.button.callback('هدف ۱', `sig:a:${id}:tp1`)],
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
        await this.bot.telegram.sendMessage(chatId, this.escapeHtml(faMessages.signals.muteOptions), {
          parse_mode: this.parseMode,
          reply_markup: Markup.inlineKeyboard([
            [Markup.button.callback('بی\u000cصدا کردن این نماد (۱ ساعت)', `sig:m:${id}:instrument`)],
            [Markup.button.callback('بی\u000cصدا کردن همه (۱ ساعت)', `sig:m:${id}:all`)],
          ]).reply_markup,
        });
        return;
      }

      await this.applyMute(chatId, id, option, chatConfig);
    }
  }

  private async handleAlertsMenu(chatId: number, ctx?: any): Promise<void> {
    await this.upsertPanel(
      chatId,
      `${faMessages.menu.alerts}\n\n${this.escapeHtml(faMessages.alerts.intro)}`,
      Markup.inlineKeyboard([[Markup.button.callback(faMessages.buttons.back, 'm:main')]]).reply_markup,
      ctx,
    );
  }

  private async handleDigestMenu(chatId: number, ctx?: any): Promise<void> {
    await this.upsertPanel(
      chatId,
      `${faMessages.menu.digest}\n\n${this.escapeHtml(faMessages.digest.intro)}`,
      Markup.inlineKeyboard([[Markup.button.callback(faMessages.buttons.back, 'm:main')]]).reply_markup,
      ctx,
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
      await this.bot.telegram.sendMessage(chat.id, this.escapeHtml(faMessages.errors.invalidQuietHours), {
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
      await this.bot.telegram.sendMessage(chatId, this.escapeHtml(faMessages.errors.tpUnavailable), {
        parse_mode: this.parseMode,
      });
      return;
    }

    if ((option === 'up05' || option === 'down05') && basePrice == null) {
      await this.bot.telegram.sendMessage(chatId, this.escapeHtml(faMessages.errors.priceUnavailable), {
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

    await this.bot.telegram.sendMessage(chatId, this.escapeHtml(faMessages.alerts.saved), {
      parse_mode: this.parseMode,
    });
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

    await this.bot.telegram.sendMessage(chatId, this.escapeHtml(faMessages.signals.muted), {
      parse_mode: this.parseMode,
    });
  }

  private async showMenu(chatId: number, ctx?: any): Promise<void> {
    await this.upsertPanel(
      chatId,
      faMessages.menu.title,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(faMessages.buttons.signals, 'm:signals'),
          Markup.button.callback(faMessages.buttons.watchlist, 'w:list'),
        ],
        [
          Markup.button.callback(faMessages.buttons.alerts, 'a:menu'),
          Markup.button.callback(faMessages.buttons.settings, 's:menu'),
        ],
        [
          Markup.button.callback(faMessages.buttons.digest, 'd:today'),
          Markup.button.callback(faMessages.buttons.help, 'm:help'),
        ],
      ]).reply_markup,
      ctx,
    );
  }

  private async showWatchlist(chatId: number, chatConfig: ChatConfig, ctx?: any): Promise<void> {
    const watchlist = chatConfig.watchlist.map((item) => item.toUpperCase());
    const list = watchlist.length > 0 ? watchlist.join('، ') : faMessages.watchlist.empty;
    const popular = this.getPopularInstruments();
    const watchlistSet = new Set(watchlist);
    const buttons = popular.map((symbol) => {
      const label = watchlistSet.has(symbol) ? `✅ ${symbol}` : `⬜ ${symbol}`;
      return Markup.button.callback(label, `w:add:${symbol}`);
    });

    const rows = [buttons.slice(0, 2), buttons.slice(2, 4), buttons.slice(4, 6)]
      .filter((row) => row.length > 0);
    rows.push([Markup.button.callback(faMessages.buttons.addManual, 'w:add:manual')]);
    rows.push([Markup.button.callback(faMessages.buttons.back, 'm:main')]);

    await this.upsertPanel(
      chatId,
      `${faMessages.menu.watchlist}\n\n<b>${faMessages.watchlist.title}:</b> ${this.escapeHtml(list)}\n${this.escapeHtml(
        faMessages.watchlist.instructions,
      )}`,
      Markup.inlineKeyboard(rows).reply_markup,
      ctx,
    );
  }

  private async showSettingsMenu(chatId: number, chatConfig: ChatConfig, ctx?: any): Promise<void> {
    await this.upsertPanel(
      chatId,
      `${faMessages.menu.settings}\n\n${this.renderStatus(chatConfig)}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback('حداقل ۶۰', 's:min:60'),
          Markup.button.callback('حداقل ۷۰', 's:min:70'),
          Markup.button.callback('حداقل ۸۰', 's:min:80'),
        ],
        [
          Markup.button.callback('۱۵دقیقه', 's:tf:15m'),
          Markup.button.callback('۱ساعت', 's:tf:1h'),
        ],
        [
          Markup.button.callback(faMessages.settings.quietHoursToggle, 's:quiet:toggle'),
          Markup.button.callback(faMessages.settings.quietHoursSet, 's:quiet:set'),
        ],
        [
          Markup.button.callback(faMessages.settings.destGroup, 's:dest:group'),
          Markup.button.callback(faMessages.settings.destChannel, 's:dest:channel'),
        ],
        [
          Markup.button.callback(faMessages.settings.assetsGold, 's:asset:GOLD'),
          Markup.button.callback(faMessages.settings.assetsCrypto, 's:asset:CRYPTO'),
        ],
        [Markup.button.callback(faMessages.buttons.back, 'm:main')],
      ]).reply_markup,
      ctx,
    );
  }

  private renderHelp(): string {
    return faMessages.help;
  }

  private renderStatus(chatConfig: ChatConfig): string {
    const assets =
      chatConfig.assetsEnabled.length > 0
        ? chatConfig.assetsEnabled.join(', ')
        : 'پیش\u000cفرض';
    const timeframes =
      chatConfig.timeframes.length > 0 ? chatConfig.timeframes.join(', ') : 'پیش\u000cفرض';
    const watchlist =
      chatConfig.watchlist.length > 0 ? chatConfig.watchlist.join(', ') : 'پیش\u000cفرض';
    const quiet = chatConfig.quietHoursEnabled
      ? `${chatConfig.quietHoursStart ?? '??'}-${chatConfig.quietHoursEnd ?? '??'} UTC`
      : faMessages.toggles.off;

    return [
      faMessages.status.title,
      `${faMessages.status.enabled} ${chatConfig.isEnabled ? faMessages.toggles.on : faMessages.toggles.off}`,
      `${faMessages.status.assets} ${this.escapeHtml(assets)}`,
      `${faMessages.status.timeframes} ${this.escapeHtml(timeframes)}`,
      `${faMessages.status.watchlist} ${this.escapeHtml(watchlist)}`,
      `${faMessages.status.minConfidence} ${chatConfig.minConfidence}%`,
      `${faMessages.status.quietHours} ${this.escapeHtml(quiet)}`,
      `${faMessages.status.sendToGroup} ${chatConfig.sendToGroup ? faMessages.toggles.on : faMessages.toggles.off}`,
      `${faMessages.status.sendToChannel} ${chatConfig.sendToChannel ? faMessages.toggles.on : faMessages.toggles.off}`,
    ].join('\n');
  }

  private async updateWatchlist(
    chatId: number,
    chatConfig: ChatConfig,
    symbol: string,
    forceAdd?: boolean,
    ctx?: any,
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

    await this.showWatchlist(chatId, updated, ctx);
  }

  private getPopularInstruments(): string[] {
    const gold = this.normalizeCsv(this.configService.get('GOLD_INSTRUMENTS', 'XAUTUSDT'));
    const crypto = this.normalizeCsv(this.configService.get('CRYPTO_INSTRUMENTS', 'BTCUSDT,ETHUSDT'));
    const legacy = this.normalizeCsv(this.configService.get('BINANCE_SYMBOLS', ''));
    const combined = crypto.length > 0 ? [...gold, ...crypto] : [...gold, ...legacy];
    const fallback = ['BTCUSDT', 'ETHUSDT', 'XAUTUSDT'];
    const unique = Array.from(new Set(combined.length > 0 ? combined : fallback));
    return unique.map((item) => item.toUpperCase()).slice(0, 6);
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
          this.escapeHtml(faMessages.errors.adminOnly),
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

  private async showSignalsPanel(chatId: number, ctx?: any): Promise<void> {
    await this.upsertPanel(
      chatId,
      `${faMessages.menu.signals}\n\n${this.escapeHtml(faMessages.signals.running)}`,
      Markup.inlineKeyboard([[Markup.button.callback(faMessages.buttons.back, 'm:main')]]).reply_markup,
      ctx,
    );
  }

  private async showHelpPanel(chatId: number, ctx?: any): Promise<void> {
    await this.upsertPanel(
      chatId,
      `${faMessages.menu.help}\n\n${this.renderHelp()}`,
      Markup.inlineKeyboard([[Markup.button.callback(faMessages.buttons.back, 'm:main')]]).reply_markup,
      ctx,
    );
  }

  private async showStatusPanel(chatId: number, chatConfig: ChatConfig, ctx?: any): Promise<void> {
    await this.upsertPanel(
      chatId,
      `${faMessages.menu.status}\n\n${this.renderStatus(chatConfig)}`,
      Markup.inlineKeyboard([[Markup.button.callback(faMessages.buttons.back, 'm:main')]]).reply_markup,
      ctx,
    );
  }

  private async upsertPanel(
    chatId: number,
    text: string,
    keyboard: any,
    ctx?: any,
  ): Promise<void> {
    const messageId =
      ctx?.callbackQuery && 'message' in ctx.callbackQuery
        ? ctx.callbackQuery.message?.message_id
        : undefined;

    if (messageId) {
      try {
        await this.bot.telegram.editMessageText(chatId, messageId, undefined, text, {
          parse_mode: this.parseMode,
          reply_markup: keyboard,
        });
        return;
      } catch (error) {
        this.logger.warn(`Failed to edit panel message: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await this.bot.telegram.sendMessage(chatId, text, {
      parse_mode: this.parseMode,
      reply_markup: keyboard,
    });
  }

  private normalizeCsv(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }

  private async safeSendMessage(chatId: number, text: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(chatId, this.escapeHtml(text), { parse_mode: this.parseMode });
    } catch (error) {
      this.logger.warn(`Failed to send message to ${chatId}: ${error instanceof Error ? error.message : String(error)}`);
    }
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
