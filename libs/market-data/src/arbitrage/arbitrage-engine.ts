import { ArbitrageStrategy, ArbitrageSnapshot } from '../interfaces';
import { ArbOpportunity } from '../models';

export class ArbitrageEngine {
  constructor(private readonly strategies: ArbitrageStrategy[]) {}

  scan(snapshot: ArbitrageSnapshot): ArbOpportunity[] {
    return this.strategies.flatMap((strategy) => strategy.scan(snapshot));
  }
}
