import { ArbitrageStrategy, ArbitrageSnapshot } from '../../interfaces';
import { ArbOpportunity } from '../../models';

export class DepthAwareArbitrageStrategy implements ArbitrageStrategy {
  readonly kind = 'DEPTH';
  readonly requiredCapabilities = ['orderbook_levels'];

  constructor(private readonly enabled: boolean) {}

  scan(_snapshot: ArbitrageSnapshot): ArbOpportunity[] {
    if (!this.enabled) {
      return [];
    }
    // TODO: پس از اضافه شدن داده‌های عمق سفارشات پیاده‌سازی شود.
    return [];
  }
}
