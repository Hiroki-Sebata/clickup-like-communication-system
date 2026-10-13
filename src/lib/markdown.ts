/**
 * Markdown rendering.
 *
 * This is the single most security-sensitive file in the app. Task descriptions and
 * comments are written by people, and your GitHub token lives in localStorage on the
 * same origin. If a <script> from an issue body ever ran, it could read that token.
 *
 * So: everything goes through DOMPurify, and nothing else in the app is allowed to
 * use dangerouslySetInnerHTML.
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  gfm: true,
  breaks: true,
});

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (!(node instanceof Element)) return;

  // Links always open in a new tab, and can never reach back into this page.
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }

  // DOMPurify allows data: URLs on images by default, and that is defensible -
  // a browser will not execute one. But a task description has no business
  // containing an inline blob, and allowing it means markup like
  // `<img src="data:text/html,<script>…">` survives into the page as text.
  // Nothing is lost by refusing them outright.
  for (const attribute of ['src', 'href', 'xlink:href']) {
    const value = node.getAttribute(attribute);
    if (value && /^\s*data:/i.test(value)) node.removeAttribute(attribute);
  }
});

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'input', 'span',
];

/** Markdown in, safe HTML out. Never returns anything that can execute. */
export function renderMarkdown(source: string): string {
  const html = marked.parse(source ?? '', { async: false }) as string;
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'title', 'alt', 'src', 'type', 'checked', 'disabled', 'class'],
    // No data: or javascript: URLs; images and links must be http(s) or relative.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|#|\/)/i,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'link', 'meta'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
  });
}

/** Strip markdown down to plain text, for search and for one-line previews. */
export function toPlainText(source: string): string {
  return (source ?? '')
    .replace(/`{1,3}[^`]*`{1,3}/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
