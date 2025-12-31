import { Injectable, Logger } from '@nestjs/common';
import { Instrument } from './models';
import { buildInstrumentFromSymbol } from './symbol-mapper';

@Injectable()
export class InstrumentRegistryService {
  private readonly logger = new Logger(InstrumentRegistryService.name);

  /**
   * NOTE:
   * In your project, the symbol list might come from:
   * - ENV (SYMBOLS=BTCUSDT,ETHUSDT,...)
   * - DB (Prisma)
   * - Config file
   * This service is a thin layer to provide a stable API to the rest of the app.
   */

  public async listActiveInstruments(): Promise<Instrument[]> {
    // fallback: read from env
    const raw = process.env.SYMBOLS ?? '';
    const symbols = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (symbols.length === 0) {
      this.logger.warn('No active symbols found in env var SYMBOLS. Returning empty list.');
      return [];
    }

    return symbols.map((symbol) => buildInstrumentFromSymbol(symbol));
  }
}