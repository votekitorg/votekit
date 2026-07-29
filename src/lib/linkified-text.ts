export interface LinkifiedTextSegment {
  type: 'text' | 'link';
  text: string;
  href?: string;
}

const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"']+/giu;
const TRAILING_PUNCTUATION_PATTERN = /[.,;:!]+$/u;

export function parseHttpLinks(text: string): LinkifiedTextSegment[] {
  const segments: LinkifiedTextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(HTTP_URL_PATTERN)) {
    const index = match.index;
    const rawUrl = match[0];

    if (index > cursor) {
      segments.push({ type: 'text', text: text.slice(cursor, index) });
    }

    const trailingPunctuation = rawUrl.match(TRAILING_PUNCTUATION_PATTERN)?.[0] ?? '';
    const href = trailingPunctuation
      ? rawUrl.slice(0, -trailingPunctuation.length)
      : rawUrl;

    try {
      const parsed = new URL(href);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        segments.push({ type: 'link', text: href, href });
      } else {
        segments.push({ type: 'text', text: href });
      }
    } catch {
      segments.push({ type: 'text', text: href });
    }

    if (trailingPunctuation) {
      segments.push({ type: 'text', text: trailingPunctuation });
    }

    cursor = index + rawUrl.length;
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', text: text.slice(cursor) });
  }

  return segments;
}
