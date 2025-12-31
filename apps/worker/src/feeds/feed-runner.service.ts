import { Injectable, Logger } from '@nestjs/common';

import { InstrumentRegistryService } from '@libs/market-data';
import { providerSymbolFromCanonical, parseOverrides } from '@libs/market-data/src/symbol-mapper';
import { MarketDataCacheService } from '../market-data/market-data-cache.service';

export interface InstrumentMapping {
  provider: string;
  canonicalSymbol: string;
  providerSymbol: string;
  providerInstId?: string;
  marketType: 'spot' | 'perp' | 'fx' | 'metal' | 'otc' | 'unknown';
  isActive: boolean;
}

@Injectable()
export class FeedRunnerService {
  private readonly logger = new Logger(FeedRunnerService.name);

  constructor(
    private readonly instrumentRegistry: InstrumentRegistryService,
    private readonly marketDataCache: MarketDataCacheService,
  ) {}

  /**
   * Build provider mappings for given providers based on canonical symbols.
   * This function is used by feed runners to decide what to fetch for each provider.
   */
  public buildMappings(params: {
    providers: string[];
    symbols: string[];
    overridesRaw?: string;
    defaultMarketType?: InstrumentMapping['marketType'];
  }): InstrumentMapping[] {
    const { providers, symbols, overridesRaw, defaultMarketType = 'spot' } = params;

    const overrides = parseOverrides(overridesRaw);

    const mappings: InstrumentMapping[] = [];
    for (const provider of providers) {
      for (const canonicalSymbol of symbols) {
        const mapped = providerSymbolFromCanonical(provider, canonicalSymbol, overrides);
        if (!mapped) continue;

        mappings.push({
          provider,
          canonicalSymbol,
          providerSymbol: mapped.providerSymbol,
          providerInstId: mapped.providerInstId,
          marketType: defaultMarketType,
          isActive: true,
        });
      }
    }

    return mappings;
  }

  /**
   * Example runner: resolve symbols from registry + fetch/cache data.
   * Your actual implementation might schedule, throttle, and dispatch provider fetches.
   */
  public async runOnce(params: {
    providers: string[];
    overridesRaw?: string;
    defaultMarketType?: InstrumentMapping['marketType'];
  }): Promise<void> {
    const { providers, overridesRaw, defaultMarketType } = params;

    // registry provides canonical symbols list
    const instruments = await this.instrumentRegistry.listActiveInstruments();
    const symbols = instruments.map((x) => x.symbol);

    const mappings = this.buildMappings({
      providers,
      symbols,
      overridesRaw,
      defaultMarketType,
    });

    // example: store mappings in cache, or trigger fetch by provider
    this.logger.log(`Built ${mappings.length} instrument mappings for providers: ${providers.join(', ')}`);

    // Example usage: cache pre-warm or store for later fetch runs
    await this.marketDataCache.setInstrumentMappings(mappings);
  }
}