export interface ParsedNewsLink {
  title: string;
  url: string;
}

export const parseNewsLinks = (html: string, baseUrl: string): ParsedNewsLink[] => {
  const links: ParsedNewsLink[] = [];
  const base = new URL(baseUrl);
  const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRegex.exec(html))) {
    const href = match[1];
    const text = match[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
      continue;
    }
    let url: string;
    try {
      url = new URL(href, baseUrl).toString();
    } catch (error) {
      continue;
    }
    const resolved = new URL(url);
    if (resolved.hostname !== base.hostname) {
      continue;
    }
    const title = text || resolved.toString();
    if (title.length < 4) {
      continue;
    }
    links.push({ title, url: resolved.toString() });
  }

  return links;
};
