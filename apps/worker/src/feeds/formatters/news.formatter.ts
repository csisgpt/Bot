import { escapeHtml } from './formatting.utils';

export interface NewsFeedItem {
  title: string;
  url: string;
  provider: string;
  tags?: string[];
}

export const formatNewsFeedMessage = (params: {
  items: NewsFeedItem[];
  includeTags: boolean;
}): string => {
  const { items, includeTags } = params;
  const lines: string[] = ['📰 <b>Market News</b>'];

  for (const item of items) {
    const title = escapeHtml(item.title);
    const provider = escapeHtml(item.provider);
    const link = `<a href="${escapeHtml(item.url)}">${title}</a>`;
    const tags = includeTags && item.tags?.length ? ` (${escapeHtml(item.tags.join(', '))})` : '';
    lines.push(`• ${link} — <i>${provider}</i>${tags}`);
  }

  return lines.join('\n');
};
