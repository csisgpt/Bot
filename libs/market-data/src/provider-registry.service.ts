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
    const enabled = this.configService
      .get<string>(
        'PROVIDERS_ENABLED',
        'binance,bybit,okx,coinbase,kraken,kucoin,gateio,mexc,bitfinex,bitstamp',
      )
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    return this.providers.filter((provider) => enabled.includes(provider.provider));
  }

  async startAll(): Promise<void> {
    const enabledProviders = this.getEnabledProviders();
    for (const provider of enabledProviders) {
      try {
        await provider.connect();
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
      await provider.disconnect();
    }
  }

  getSnapshots(): ProviderSnapshot[] {
    return this.providers.map((provider) => provider.getSnapshot());
  }
}
