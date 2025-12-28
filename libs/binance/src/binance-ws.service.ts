import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as WebSocket from 'ws';
import { RedisService } from '@libs/core';
import { getPriceCacheKey, normalizeSymbol } from './market-price.service';

interface MiniTickerEvent {
  E: number;
  s: string;
  c: string;
}

@Injectable()
export class BinanceWsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BinanceWsService.name);
  private ws?: WebSocket;
  private reconnectTimeout?: NodeJS.Timeout;
  private heartbeatInterval?: NodeJS.Timeout;
  private shuttingDown = false;
  private readonly reconnectMs: number;
  private readonly ttlSeconds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.reconnectMs = this.configService.get<number>('BINANCE_WS_RECONNECT_MS', 3000);
    this.ttlSeconds = this.configService.get<number>('PRICE_CACHE_TTL_SECONDS', 120);
  }

  onModuleInit(): void {
    const enabled = this.configService.get<boolean>('BINANCE_WS_ENABLED', true);
    const priceIngestEnabled = this.configService.get<boolean>('PRICE_INGEST_ENABLED', true);
    if (this.configService.get<boolean>('MARKET_DATA_INGEST_ENABLED', false)) {
      this.logger.warn('وب‌سوکت بایننس غیرفعال شد چون بازار چندمنبعی فعال است');
      return;
    }
    if (!enabled || !priceIngestEnabled) {
      return;
    }

    this.connect();
  }

  async onModuleDestroy(): Promise<void> {
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

  private connect(): void {
    const streams = this.getStreams();
    if (streams.length === 0) {
      this.logger.warn('Binance WS has no instruments configured.');
      return;
    }

    const baseUrl = this.configService.get<string>(
      'BINANCE_WS_BASE_URL',
      'wss://stream.binance.com:9443',
    );
    const url = `${baseUrl}/stream?streams=${streams.join('/')}`;

    this.logger.log(`Connecting to Binance WS (${streams.length} streams)`);
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.logger.log('Binance WS connected');
      this.startHeartbeat();
    });

    this.ws.on('message', (data: WebSocket.RawData) => {
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

    this.ws.on('error', (error: Error) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Binance WS error: ${message}`);
      this.cleanupSocket();
      this.scheduleReconnect();
    });
  }

  private getStreams(): string[] {
    const instruments = this.parseList(
      this.configService.get<string>('BINANCE_WS_INSTRUMENTS') ??
        this.configService.get<string>('PRICE_TICKER_INSTRUMENTS', 'XAUTUSDT'),
    );
    const streamType = this.configService.get<string>('BINANCE_WS_STREAMS', 'miniTicker');

    return instruments.map((symbol) => `${normalizeSymbol(symbol).toLowerCase()}@${streamType}`);
  }

  private async handleMessage(message: WebSocket.RawData): Promise<void> {
    const payload = this.parseMessage(message);
    if (!payload?.data) {
      return;
    }

    const event = payload.data as MiniTickerEvent;
    if (!event?.s || !event?.c) {
      return;
    }

    const symbol = normalizeSymbol(event.s);
    const price = Number(event.c);
    if (!Number.isFinite(price)) {
      return;
    }
    const ts = Number.isFinite(event.E) ? event.E : Date.now();

    await this.redisService.set(
      getPriceCacheKey(symbol, 'BINANCE'),
      JSON.stringify({ price, ts }),
      'EX',
      this.ttlSeconds,
    );
  }

  private parseMessage(message: WebSocket.RawData): { data?: MiniTickerEvent } | null {
    try {
      const raw = typeof message === 'string' ? message : message.toString();
      return JSON.parse(raw) as { data?: MiniTickerEvent };
    } catch (error) {
      return null;
    }
  }

  private startHeartbeat(): void {
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

  private cleanupSocket(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws = undefined;
    }
  }

  private scheduleReconnect(): void {
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

  private parseList(value?: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(String).map((x) => x.trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value.split(',').map((x) => x.trim()).filter(Boolean);
    }
    return [];
  }
}
