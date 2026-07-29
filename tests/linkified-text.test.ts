import { describe, expect, it } from 'vitest';
import { parseHttpLinks } from '@/lib/linkified-text';

describe('election description links', () => {
  it('turns multiple HTTP and HTTPS URLs into separate links', () => {
    expect(parseHttpLinks(
      'Read https://example.com/guide and http://example.org/rules before voting.'
    )).toEqual([
      { type: 'text', text: 'Read ' },
      { type: 'link', text: 'https://example.com/guide', href: 'https://example.com/guide' },
      { type: 'text', text: ' and ' },
      { type: 'link', text: 'http://example.org/rules', href: 'http://example.org/rules' },
      { type: 'text', text: ' before voting.' },
    ]);
  });

  it('leaves non-HTTP text and HTML-looking content inert', () => {
    expect(parseHttpLinks('See example.com or <script>alert(1)</script>')).toEqual([
      { type: 'text', text: 'See example.com or <script>alert(1)</script>' },
    ]);
  });

  it('keeps sentence punctuation outside the destination URL', () => {
    expect(parseHttpLinks('Details: https://example.com/info.')).toEqual([
      { type: 'text', text: 'Details: ' },
      { type: 'link', text: 'https://example.com/info', href: 'https://example.com/info' },
      { type: 'text', text: '.' },
    ]);
  });
});
