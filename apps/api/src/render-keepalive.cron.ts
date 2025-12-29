import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class RenderKeepAliveCron {
  private readonly logger = new Logger(RenderKeepAliveCron.name);

  constructor(private readonly config: ConfigService) {}

  // هر 10 دقیقه (کمتر از 15 دقیقه inactivity رندر)
  @Cron('*/10 * * * *')
  async ping() {;
    const url = this.config.get<string>('RENDER_KEEPALIVE_URL');
    const enabled = this.config.get<boolean>('RENDER_KEEPALIVE_ENABLED') === true;
    if (!enabled || !url) return;
    try {
      const u = new URL(url);
      u.searchParams.set('ts', String(Date.now())); // جلوگیری از cache
      const res = await fetch(u.toString(), { method: 'GET' });

      // فقط اگر خواستی لاگ سبک باشه:
      if (res.status >= 400) this.logger.warn(`Render keepalive -> ${res.status}`);
      else this.logger.log(`Render keepalive -> ${res.status}`);
    } catch (e: any) {
      this.logger.warn(`Render keepalive failed: ${e?.message ?? e}`);
    }
  }
}
