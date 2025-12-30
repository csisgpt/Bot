import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketDataProvider } from './interfaces';
import { ProviderSnapshot } from './models';

export const MARKET_DATA_PROVIDERS = Symbol('MARKET_DATA_PROVIDERS');

@Injectable()
export class ProviderRegistryService {
  private readonly logger = new Logger(ProviderRegistryService.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(MARKET_DATA_PROVIDERS)
    private readonly providers: MarketDataProvider[],
  ) {}

  getEnabledProviders(): MarketDataProvider[] {
    const enabled = this.getProviderList(
      'MARKET_DATA_ENABLED_PROVIDERS',
      'binance,bybit,okx,coinbase,kraken,kucoin,gateio,mexc,bitfinex,bitstamp',
    );

    return this.providers.filter((provider) => enabled.includes(provider.provider));
  }

  getWsEnabledProviders(): MarketDataProvider[] {
    const enabled = this.getProviderList(
      'MARKET_DATA_WS_ENABLED_PROVIDERS',
      'binance,bybit,okx,coinbase,kraken',
    );
    return this.getEnabledProviders().filter(
      (provider) => provider.supportsWebsocket && enabled.includes(provider.provider),
    );
  }

  async startAll(): Promise<void> {
    const enabledProviders = this.getEnabledProviders();
    for (const provider of enabledProviders) {
      try {
        await provider.start();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(
          JSON.stringify({ event: 'provider_connect_failed', provider: provider.provider, message }),
        );
      }
    }
  }

  async stopAll(): Promise<void> {
    for (const provider of this.providers) {
      await provider.stop();
    }
  }

  getSnapshots(): ProviderSnapshot[] {
    return this.providers.map((provider) => provider.getSnapshot());
  }

  private getProviderList(key: string, fallback: string): string[] {
    const raw = this.configService.get<string>(key, fallback);
    return raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }
}
