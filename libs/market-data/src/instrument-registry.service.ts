import { Injectable, Logger } from '@nestjs/common';
import { Instrument, InstrumentMapping } from './models';
import {
  buildInstrumentFromSymbol,
  normalizeCanonicalSymbol,
  providerSymbolFromCanonical,
} from './symbol-mapper';

@Injectable()
export class InstrumentRegistryService {
  private readonly logger = new Logger(InstrumentRegistryService.name);
  private activeSymbols: string[] = [];

  setActiveSymbols(symbols: string[]): void {
    this.activeSymbols = symbols.map(normalizeCanonicalSymbol).filter(Boolean);
  }

  getInstruments(): Instrument[] {
    return this.activeSymbols
      .map((symbol) => buildInstrumentFromSymbol(symbol))
      .filter((instrument): instrument is Instrument => Boolean(instrument?.isActive));
  }

  getActiveSymbols(): string[] {
    return [...this.activeSymbols];
  }

  getMappingsForProvider(provider: string): InstrumentMapping[] {
    const normalizedProvider = provider.toLowerCase();
    return this.buildMappings(normalizedProvider);
  }

  getMappingsForProviders(providers: string[]): InstrumentMapping[] {
    return providers.flatMap((provider) => this.getMappingsForProvider(provider));
  }

  findMapping(provider: string, providerSymbol: string): InstrumentMapping | undefined {
    const normalizedProvider = provider.toLowerCase();
    const normalizedSymbol = providerSymbol.trim().toUpperCase();
    return this.buildMappings(normalizedProvider).find(
      (mapping) =>
        mapping.providerSymbol === normalizedSymbol ||
        mapping.providerInstId === normalizedSymbol,
    );
  }

  private buildMappings(provider: string): InstrumentMapping[] {
    return this.getInstruments()
      .map((instrument) => {
        const mapping = providerSymbolFromCanonical(provider, instrument.canonicalSymbol);
        if (!mapping) {
          this.logger.warn(
            JSON.stringify({
              event: 'symbol_mapping_skipped',
              provider,
              symbol: instrument.canonicalSymbol,
            }),
          );
          return null;
        }
        return {
          provider,
          canonicalSymbol: instrument.canonicalSymbol,
          providerSymbol: mapping.providerSymbol,
          providerInstId: mapping.providerInstId,
          marketType: 'spot',
          isActive: true,
        } as InstrumentMapping;
      })
      .filter((mapping): mapping is InstrumentMapping => Boolean(mapping));
  }
}