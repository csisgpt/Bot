import { ArbitrageStrategy, ArbitrageSnapshot } from '../../interfaces';
import { ArbOpportunity } from '../../models';

export class FundingDivergenceStrategy implements ArbitrageStrategy {
  readonly kind = 'FUNDING';
  readonly requiredCapabilities = ['funding_rate'];

  constructor(private readonly enabled: boolean) {}

  scan(_snapshot: ArbitrageSnapshot): ArbOpportunity[] {
    if (!this.enabled) {
      return [];
    }
    // TODO: از REST صرافی‌ها برای نرخ فاندینگ استفاده شود.
    return [];
  }
}
