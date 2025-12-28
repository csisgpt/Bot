import { describe, expect, it } from 'vitest';
import { parseNewsLinks } from '../apps/worker/src/news/news-parser';

describe('news parser', () => {
  it('resolves relative links and filters other domains', () => {
    const html = `
      <a href="/article/1">خبر ۱</a>
      <a href="https://www.okx.com/article/2">خبر ۲</a>
      <a href="https://evil.com/phish">بد</a>
      <a href="#anchor">لینک</a>
    `;
    const links = parseNewsLinks(html, 'https://www.okx.com/support');
    expect(links).toEqual([
      { title: 'خبر ۱', url: 'https://www.okx.com/article/1' },
      { title: 'خبر ۲', url: 'https://www.okx.com/article/2' },
    ]);
  });
});
