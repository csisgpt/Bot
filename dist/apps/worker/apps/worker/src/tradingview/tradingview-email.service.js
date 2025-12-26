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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TradingViewEmailIngestService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingViewEmailIngestService = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const imapflow_1 = require("imapflow");
const mailparser_1 = require("mailparser");
const bullmq_2 = require("bullmq");
const core_1 = require("../../../../libs/core/src/index");
let TradingViewEmailIngestService = TradingViewEmailIngestService_1 = class TradingViewEmailIngestService {
    constructor(configService, signalsQueue) {
        this.configService = configService;
        this.signalsQueue = signalsQueue;
        this.logger = new common_1.Logger(TradingViewEmailIngestService_1.name);
        this.running = false;
    }
    onModuleInit() {
        const enabled = this.configService.get('TRADINGVIEW_EMAIL_ENABLED', false);
        if (!enabled)
            return;
        const pollSeconds = this.configService.get('TRADINGVIEW_EMAIL_POLL_SECONDS', 30);
        const pollMs = Math.max(5, pollSeconds) * 1000;
        this.logger.log(`TradingView email ingest enabled. Polling every ${pollMs}ms`);
        this.timer = setInterval(() => {
            void this.poll();
        }, pollMs);
    }
    onModuleDestroy() {
        if (this.timer)
            clearInterval(this.timer);
        this.timer = undefined;
    }
    async poll() {
        if (this.running)
            return;
        this.running = true;
        try {
            await this.pollOnce();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.logger.warn(`TradingView email ingest failed: ${message}`);
        }
        finally {
            this.running = false;
        }
    }
    async pollOnce() {
        const enabled = this.configService.get('TRADINGVIEW_EMAIL_ENABLED', false);
        if (!enabled)
            return;
        const host = this.configService.get('TRADINGVIEW_IMAP_HOST');
        const user = this.configService.get('TRADINGVIEW_IMAP_USER');
        const pass = this.configService.get('TRADINGVIEW_IMAP_PASS');
        if (!host || !user || !pass) {
            this.logger.warn('TradingView email ingest is enabled but IMAP credentials are missing.');
            return;
        }
        const client = new imapflow_1.ImapFlow({
            host,
            port: this.configService.get('TRADINGVIEW_IMAP_PORT', 993),
            secure: this.configService.get('TRADINGVIEW_IMAP_SECURE', true),
            auth: { user, pass },
        });
        try {
            await client.connect();
            const mailbox = this.configService.get('TRADINGVIEW_EMAIL_FOLDER', 'INBOX');
            await client.mailboxOpen(mailbox);
            const unseen = await client.search({ seen: false });
            if (!unseen || unseen.length === 0)
                return;
            for await (const message of client.fetch(unseen, { source: true, envelope: true })) {
                if (!message.source) {
                    this.logger.warn(`IMAP message uid=${message.uid} has no source; skipping.`);
                    continue;
                }
                const parsed = (await (0, mailparser_1.simpleParser)(message.source));
                const body = (typeof parsed.text === 'string' && parsed.text) ||
                    (typeof parsed.html === 'string' && parsed.html) ||
                    '';
                const subject = parsed.subject ? String(parsed.subject) : '';
                const payloads = this.extractPayloads(body);
                if (payloads.length === 0) {
                    await client.messageFlagsAdd(message.uid, ['\\Seen']);
                    continue;
                }
                for (const payload of payloads) {
                    await this.signalsQueue.add('ingestTradingViewAlert', {
                        receivedAt: new Date().toISOString(),
                        ip: 'email',
                        headersSubset: { subject },
                        payloadRaw: payload,
                    }, { removeOnComplete: true, removeOnFail: { count: 50 } });
                }
                await client.messageFlagsAdd(message.uid, ['\\Seen']);
            }
        }
        finally {
            try {
                await client.logout();
            }
            catch {
            }
        }
    }
    extractPayloads(body) {
        const trimmed = body.trim();
        if (!trimmed)
            return [];
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
            const parsed = this.safeParseJson(trimmed);
            return parsed ? [parsed] : [];
        }
        const payloads = [];
        const regex = /---TV_JSON---([\s\S]*?)---\/TV_JSON---/g;
        let match;
        while ((match = regex.exec(body)) !== null) {
            const candidate = match[1]?.trim();
            if (!candidate)
                continue;
            const parsed = this.safeParseJson(candidate);
            if (parsed)
                payloads.push(parsed);
        }
        return payloads;
    }
    safeParseJson(value) {
        try {
            return JSON.parse(value);
        }
        catch {
            return undefined;
        }
    }
};
exports.TradingViewEmailIngestService = TradingViewEmailIngestService;
exports.TradingViewEmailIngestService = TradingViewEmailIngestService = TradingViewEmailIngestService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, bullmq_1.InjectQueue)(core_1.SIGNALS_QUEUE_NAME)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        bullmq_2.Queue])
], TradingViewEmailIngestService);
//# sourceMappingURL=tradingview-email.service.js.map