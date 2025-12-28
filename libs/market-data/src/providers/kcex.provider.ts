import { EventEmitter } from 'events';
import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';
import { MarketDataProvider } from '../interfaces';
import { InstrumentMapping, ProviderSnapshot } from '../models';

@Injectable()
export class KcexMarketDataProvider extends EventEmitter implements MarketDataProvider {
  readonly provider = 'kcex';
  private readonly logger = new Logger('kcex-provider');
  private connected = false;
  private lastMessageTs: number | null = null;
  private reconnects = 0;
  private failures = 0;
  private lastError: string | null = null;

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async connect(): Promise<void> {
    const enabled = this.configService.get<boolean>('KCEX_ENABLE', false);
    if (!enabled) {
      this.logger.log(
        JSON.stringify({ event: 'provider_disabled', provider: this.provider }),
      );
      return;
    }
    const restUrl = this.configService.get<string>('KCEX_REST_URL');
    const wsUrl = this.configService.get<string>('KCEX_WS_URL');
    this.lastError = 'پیاده‌سازی نشده: مستندات KCEX موجود نیست';
    this.failures += 1;
    if (!restUrl || !wsUrl) {
      throw new Error('پیاده‌سازی نشده: مستندات KCEX موجود نیست');
    }
    throw new Error('پیاده‌سازی نشده: مستندات KCEX موجود نیست');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async subscribeTickers(_instruments: InstrumentMapping[]): Promise<void> {
    return;
  }

  async subscribeCandles(_instruments: InstrumentMapping[], _timeframes: string[]): Promise<void> {
    return;
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
}
