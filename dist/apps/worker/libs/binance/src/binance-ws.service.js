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
var BinanceWsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinanceWsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const WebSocket = require("ws");
const core_1 = require("../../core/src/index");
const market_price_service_1 = require("./market-price.service");
let BinanceWsService = BinanceWsService_1 = class BinanceWsService {
    constructor(configService, redisService) {
        this.configService = configService;
        this.redisService = redisService;
        this.logger = new common_1.Logger(BinanceWsService_1.name);
        this.shuttingDown = false;
        this.reconnectMs = this.configService.get('BINANCE_WS_RECONNECT_MS', 3000);
        this.ttlSeconds = this.configService.get('PRICE_CACHE_TTL_SECONDS', 120);
    }
    onModuleInit() {
        const enabled = this.configService.get('BINANCE_WS_ENABLED', true);
        const priceTickerEnabled = this.configService.get('PRICE_TICKER_ENABLED', false);
        if (!enabled || !priceTickerEnabled) {
            return;
        }
        this.connect();
    }
    async onModuleDestroy() {
        this.shuttingDown = true;
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
    }
    connect() {
        const streams = this.getStreams();
        if (streams.length === 0) {
            this.logger.warn('Binance WS has no instruments configured.');
            return;
        }
        const baseUrl = this.configService.get('BINANCE_WS_BASE_URL', 'wss://stream.binance.com:9443');
        const url = `${baseUrl}/stream?streams=${streams.join('/')}`;
        this.logger.log(`Connecting to Binance WS (${streams.length} streams)`);
        this.ws = new WebSocket(url);
        this.ws.on('open', () => {
            this.logger.log('Binance WS connected');
            this.startHeartbeat();
        });
        this.ws.on('message', (data) => {
            void this.handleMessage(data).catch((error) => {
                const message = error instanceof Error ? error.message : 'Unknown error';
                this.logger.warn(`Failed to handle WS message: ${message}`);
            });
        });
        this.ws.on('close', () => {
            this.logger.warn('Binance WS disconnected');
            this.cleanupSocket();
            this.scheduleReconnect();
        });
        this.ws.on('error', (error) => {
            const message = error instanceof Error ? error.message : 'Unknown error';
            this.logger.warn(`Binance WS error: ${message}`);
            this.cleanupSocket();
            this.scheduleReconnect();
        });
    }
    getStreams() {
        const instruments = this.parseList(this.configService.get('BINANCE_WS_INSTRUMENTS') ??
            this.configService.get('PRICE_TICKER_INSTRUMENTS', 'XAUTUSDT'));
        const streamType = this.configService.get('BINANCE_WS_STREAMS', 'miniTicker');
        return instruments.map((symbol) => `${(0, market_price_service_1.normalizeSymbol)(symbol).toLowerCase()}@${streamType}`);
    }
    async handleMessage(message) {
        const payload = this.parseMessage(message);
        if (!payload?.data) {
            return;
        }
        const event = payload.data;
        if (!event?.s || !event?.c) {
            return;
        }
        const symbol = (0, market_price_service_1.normalizeSymbol)(event.s);
        const price = Number(event.c);
        if (!Number.isFinite(price)) {
            return;
        }
        const ts = Number.isFinite(event.E) ? event.E : Date.now();
        await this.redisService.set((0, market_price_service_1.getPriceCacheKey)(symbol), JSON.stringify({ price, ts }), 'EX', this.ttlSeconds);
    }
    parseMessage(message) {
        try {
            const raw = typeof message === 'string' ? message : message.toString();
            return JSON.parse(raw);
        }
        catch (error) {
            return null;
        }
    }
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        this.heartbeatInterval = setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                return;
            }
            this.ws.ping();
        }, 20000);
    }
    cleanupSocket() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = undefined;
        }
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws = undefined;
        }
    }
    scheduleReconnect() {
        if (this.shuttingDown) {
            return;
        }
        if (this.reconnectTimeout) {
            return;
        }
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = undefined;
            this.connect();
        }, this.reconnectMs);
    }
    parseList(value) {
        return (value ?? '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean);
    }
};
exports.BinanceWsService = BinanceWsService;
exports.BinanceWsService = BinanceWsService = BinanceWsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        core_1.RedisService])
], BinanceWsService);
//# sourceMappingURL=binance-ws.service.js.map