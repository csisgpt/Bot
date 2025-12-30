import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketDataProvider, MarketDataProviderHealth } from './market-data-provider.interface';

export const MARKET_DATA_PROVIDERS = Symbol('MARKET_DATA_PROVIDERS');

@Injectable()
export class ProviderRegistryService {
  constructor(
    private readonly configService: ConfigService,
    @Inject(MARKET_DATA_PROVIDERS) private readonly providers: MarketDataProvider[],
  ) {}

  getEnabledProviders(): MarketDataProvider[] {
    const enabled = this.configService
      .get<string>('PROVIDERS_ENABLED', 'binance,bybit,okx')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);

    return this.providers.filter((provider) => enabled.includes(provider.name));
  }

  getProviderByName(name: string): MarketDataProvider | undefined {
    return this.providers.find((provider) => provider.name === name.toLowerCase());
  }

  getBestProvider(preferred?: string[]): MarketDataProvider | undefined {
    const enabled = this.getEnabledProviders();
    if (!preferred || preferred.length === 0) {
      return enabled[0];
    }
    const normalized = preferred.map((item) => item.toLowerCase());
    return enabled.find((provider) => normalized.includes(provider.name));
  }

  getHealthSummary(): MarketDataProviderHealth[] {
    return this.providers.map((provider) => provider.getHealth());
  }
}
