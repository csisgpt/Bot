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
  protected readonly sendQueue: string[] = [];
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

  async start(): Promise<void> {
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
      this.flushQueue();
      this.startHeartbeat();
    });
    this.ws.on('message', (data) => {
      this.lastMessageTs = Date.now();
      try {
        this.onMessage(data);
      } catch (e) {
        this.failures += 1;
        this.lastError = e instanceof Error ? e.message : String(e);
        this.logger.warn(JSON.stringify({ event: 'provider_on_message_failed', provider: this.provider, message: this.lastError }));
      }
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

  async stop(): Promise<void> {
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
    const message = JSON.stringify(payload);
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.sendQueue.push(message);
      return;
    }
    this.ws.send(message);
  }

  private flushQueue(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    while (this.sendQueue.length) {
      const message = this.sendQueue.shift();
      if (message) {
        this.ws.send(message);
      }
    }
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
      void this.start();
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

    const ws = this.ws;
    this.ws = undefined;
    this.connected = false;

    if (!ws) return;

    // ✅ IMPORTANT: ensure there is ALWAYS an error handler before we close/terminate
    ws.on('error', () => { });

    // ✅ Detach our listeners (but DO NOT remove 'error' handler)
    ws.removeAllListeners('open');
    ws.removeAllListeners('message');
    ws.removeAllListeners('close');
    // (error handlers remain; we just added a noop above)

    try {
      // If it's OPEN, close gracefully
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'cleanup');
        return;
      }

      // If CONNECTING or CLOSING, terminate (can emit error, but we have handler)
      if (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.CLOSING) {
        ws.terminate();
        return;
      }
    } catch {
      // swallow – we must never crash here
    }
  }

}
