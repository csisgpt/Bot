import { Injectable } from '@nestjs/common';
import { Instrument, InstrumentMapping } from './models';
import { seedInstrumentMappings, seedInstruments } from './instruments.seed';

@Injectable()
export class InstrumentRegistryService {
  private readonly instruments: Instrument[] = seedInstruments;
  private readonly mappings: InstrumentMapping[] = seedInstrumentMappings;

  getInstruments(): Instrument[] {
    return this.instruments.filter((instrument) => instrument.isActive);
  }

  getMappingsForProvider(provider: string): InstrumentMapping[] {
    return this.mappings.filter(
      (mapping) => mapping.provider === provider && mapping.isActive,
    );
  }

  getMappingsForProviders(providers: string[]): InstrumentMapping[] {
    return this.mappings.filter(
      (mapping) => providers.includes(mapping.provider) && mapping.isActive,
    );
  }

  findMapping(provider: string, providerSymbol: string): InstrumentMapping | undefined {
    const normalized = providerSymbol.trim().toUpperCase();
    return this.mappings.find(
      (mapping) =>
        mapping.provider === provider &&
        mapping.isActive &&
        (mapping.providerSymbol === normalized || mapping.providerInstId === normalized),
    );
  }
}
