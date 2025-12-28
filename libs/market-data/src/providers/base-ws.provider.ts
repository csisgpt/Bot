import { EventEmitter } from 'events';
import { Logger } from '@nestjs/common';
import * as WebSocket from 'ws';
import { ProviderSnapshot } from '../models';

export interface WsProviderOptions {
  url: string;
  heartbeatMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
}

export abstract class BaseWsProvider extends EventEmitter {
  protected readonly logger: Logger;
  protected ws?: WebSocket;
  protected connected = false;
  protected lastMessageTs: number | null = null;
  protected reconnects = 0;
  protected failures = 0;
  protected lastError: string | null = null;
  private heartbeatTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private reconnectDelayMs: number;
  private readonly reconnectBaseMs: number;
  private readonly reconnectMaxMs: number;
  private readonly heartbeatMs: number;

  protected constructor(
    readonly provider: string,
    protected options: WsProviderOptions,
  ) {
    super();
    this.logger = new Logger(`${provider}-provider`);
    this.reconnectBaseMs = options.reconnectBaseMs ?? 2000;
    this.reconnectMaxMs = options.reconnectMaxMs ?? 30_000;
    this.heartbeatMs = options.heartbeatMs ?? 20000;
    this.reconnectDelayMs = this.reconnectBaseMs;
  }

  protected abstract buildUrl(): string;
  protected abstract onOpen(): void;
  protected abstract onMessage(data: WebSocket.RawData): void;
  protected abstract onClose(): void;

  async connect(): Promise<void> {
    if (this.ws && this.connected) {
      return;
    }
    const url = this.buildUrl();
    this.logger.log(
      JSON.stringify({ event: 'provider_connecting', provider: this.provider, url }),
    );
    this.ws = new WebSocket(url);
    this.ws.on('open', () => {
      this.connected = true;
      this.reconnectDelayMs = this.reconnectBaseMs;
      this.onOpen();
      this.startHeartbeat();
    });
    this.ws.on('message', (data) => {
      this.lastMessageTs = Date.now();
      this.onMessage(data);
    });
    this.ws.on('close', () => {
      this.connected = false;
      this.onClose();
      this.cleanup();
      this.scheduleReconnect();
    });
    this.ws.on('error', (error) => {
      this.failures += 1;
      this.lastError = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        JSON.stringify({
          event: 'provider_ws_error',
          provider: this.provider,
          message: this.lastError,
        }),
      );
      this.cleanup();
      this.scheduleReconnect();
    });
  }

  async disconnect(): Promise<void> {
    this.cleanup();
  }

  getSnapshot(): ProviderSnapshot {
    return {
      provider: this.provider,
      connected: this.connected,
      lastMessageTs: this.lastMessageTs,
      reconnects: this.reconnects,
      failures: this.failures,
      lastError: this.lastError,
    };
  }

  protected send(payload: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }
      this.ws.ping();
    }, this.heartbeatMs);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }
    this.reconnects += 1;
    const delay = Math.min(this.reconnectDelayMs, this.reconnectMaxMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.reconnectMaxMs);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, delay);
  }

  protected cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = undefined;
    }
  }
}
