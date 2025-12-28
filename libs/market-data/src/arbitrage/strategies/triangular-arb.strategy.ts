import { ArbitrageStrategy, ArbitrageSnapshot } from '../../interfaces';
import { ArbOpportunity } from '../../models';

export class TriangularArbitrageStrategy implements ArbitrageStrategy {
  readonly kind = 'TRIANGULAR';
  readonly requiredCapabilities = ['multi_pair'];

  constructor(private readonly enabled: boolean) {}

  scan(_snapshot: ArbitrageSnapshot): ArbOpportunity[] {
    if (!this.enabled) {
      return [];
    }
    // TODO: بعد از آماده شدن اسنپ‌شات چندجفتی پیاده‌سازی شود.
    return [];
  }
}
