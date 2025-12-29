import { Injectable } from '@nestjs/common';
import { ArbOpportunity, News, Signal } from '@prisma/client';
import { formatSignalMessage } from '@libs/telegram';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

const formatPercent = (value?: number | null, digits = 2): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'نامشخص';
  return `${value.toFixed(digits)}٪`;
};

const formatNumber = (value?: number | null, digits = 4): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return 'نامشخص';
  return value.toFixed(digits);
};

@Injectable()
export class MessageFormatterService {
  formatSignal(signal: Signal): string {
    return formatSignalMessage(signal as unknown as any);
  }

  formatNews(news: News): string {
    const lines = [
      '📰 <b>خبر جدید</b>',
      `<b>عنوان:</b> ${escapeHtml(news.title)}`,
      `<b>منبع:</b> ${escapeHtml(news.provider)}`,
      `<b>دسته‌بندی:</b> ${escapeHtml(news.category)}`,
      lines.push(`<b>برچسب‌ها:</b> ${escapeHtml(news.tags.join('، '))}`);
      `<b>زمان:</b> ${escapeHtml(news.ts.toISOString())}`,
    ];

    if (news.tags?.length) {
      lines.push(`<b>برچسبها:</b> ${escapeHtml(news.tags.join('، '))}`);
    }

    lines.push(`<b>لینک:</b> ${escapeHtml(news.url)}`);

    return lines.join('\n');
  }

  formatArbitrage(arb: ArbOpportunity): string {
    const lines = [
      '⚡ <b>فرصت آربیتراژ</b>',
      `<b>نماد:</b> ${escapeHtml(arb.canonicalSymbol)}`,
      `<b>خرید از:</b> ${escapeHtml(arb.buyExchange)}`,
      `<b>فروش در:</b> ${escapeHtml(arb.sellExchange)}`,
      `<b>اختلاف قیمت:</b> ${formatPercent(arb.spreadPct)}`,
      `<b>سود خالص:</b> ${formatPercent(arb.netPct)}`,
      `<b>قیمت خرید:</b> ${formatNumber(arb.buyPrice)}`,
      `<b>قیمت فروش:</b> ${formatNumber(arb.sellPrice)}`,
      `<b>اعتماد:</b> ${formatPercent(arb.confidence, 0)}`,
      `<b>زمان:</b> ${escapeHtml(arb.ts.toISOString())}`,
    ];

    return lines.join('\n');
  }
}
