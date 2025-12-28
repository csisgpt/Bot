export interface ParsedNewsLink {
  title: string;
  url: string;
}

export const parseNewsLinks = (html: string, baseUrl: string): ParsedNewsLink[] => {
  const links: ParsedNewsLink[] = [];
  const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html))) {
    const href = match[1];
    const text = match[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!href) {
      continue;
    }
    const url = href.startsWith('http') ? href : `${baseUrl.replace(/\/$/, '')}${href}`;
    const title = text || url;
    if (title.length < 4) {
      continue;
    }
    links.push({ title, url });
  }

  return links;
};
