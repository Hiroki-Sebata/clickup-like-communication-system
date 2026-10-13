import { describe, it, expect } from 'vitest';
import { parseBody, parseMeta, writeMeta, updateMeta, isValidDue } from '../lib/metadata';

describe('parseBody', () => {
  it('reads a normal block at the top', () => {
    const raw = '<!-- board: {"due":"2026-10-20","estimate":"2h"} -->\n\nBuild the homepage.';
    const r = parseBody(raw);
    expect(r.meta).toEqual({ due: '2026-10-20', estimate: '2h' });
    expect(r.body).toBe('Build the homepage.');
    expect(r.hadBlock).toBe(true);
  });

  it('copes with an issue that has no block at all', () => {
    const r = parseBody('Just a description.');
    expect(r.meta).toEqual({});
    expect(r.body).toBe('Just a description.');
    expect(r.hadBlock).toBe(false);
  });

  it('copes with an empty or missing body', () => {
    expect(parseBody('').body).toBe('');
    expect(parseBody(null).meta).toEqual({});
    expect(parseBody(undefined).body).toBe('');
  });

  it('treats broken JSON as no metadata but keeps the text', () => {
    const raw = '<!-- board: {"due": -->\n\nStill my words.';
    const r = parseBody(raw);
    // The regex needs a closing brace, so this block is not even recognised.
    expect(r.meta).toEqual({});
    expect(r.body).toContain('Still my words.');
  });

  it('treats a recognisable block with bad JSON as empty metadata', () => {
    const raw = '<!-- board: {"due" "2026-01-01"} -->\n\nText.';
    const r = parseBody(raw);
    expect(r.hadBlock).toBe(true);
    expect(r.meta).toEqual({});
    expect(r.body).toBe('Text.');
  });

  it('ignores fields it does not know and wrong types', () => {
    const raw = '<!-- board: {"due":123,"estimate":"1d","secret":"x"} -->\nText.';
    expect(parseMeta(raw)).toEqual({ estimate: '1d' });
  });

  it('tolerates extra spacing inside the comment', () => {
    const raw = '<!--   board:   {"due":"2026-03-01"}   -->\nText.';
    expect(parseMeta(raw)).toEqual({ due: '2026-03-01' });
  });

  it('finds a block that is not at the top', () => {
    const raw = 'Some notes.\n\n<!-- board: {"due":"2026-05-05"} -->';
    const r = parseBody(raw);
    expect(r.meta).toEqual({ due: '2026-05-05' });
    expect(r.body).toBe('Some notes.');
  });
});

describe('writeMeta', () => {
  it('adds a block to a body that had none, without touching the text', () => {
    const out = writeMeta('Line one.\n\nLine two.', { due: '2026-10-20' });
    expect(out).toBe('<!-- board: {"due":"2026-10-20"} -->\n\nLine one.\n\nLine two.');
  });

  it('replaces an existing block and leaves the description alone', () => {
    const raw = '<!-- board: {"due":"2026-01-01","estimate":"1h"} -->\n\n# Heading\n\nBody with <!-- a comment --> inside.';
    const out = writeMeta(raw, { due: '2026-02-02', estimate: '4h' });
    expect(out).toBe(
      '<!-- board: {"due":"2026-02-02","estimate":"4h"} -->\n\n# Heading\n\nBody with <!-- a comment --> inside.',
    );
  });

  it('removes the block entirely when there is nothing to store', () => {
    const raw = '<!-- board: {"due":"2026-01-01"} -->\n\nText only.';
    expect(writeMeta(raw, {})).toBe('Text only.');
  });

  it('works on an empty description', () => {
    expect(writeMeta('', { estimate: '30m' })).toBe('<!-- board: {"estimate":"30m"} -->');
  });

  it('is stable: writing the same metadata twice gives the same string', () => {
    const once = writeMeta('Text.', { estimate: '2h', due: '2026-10-20' });
    const twice = writeMeta(once, parseMeta(once));
    expect(twice).toBe(once);
    // key order is always due, then estimate
    expect(once.startsWith('<!-- board: {"due":"2026-10-20","estimate":"2h"} -->')).toBe(true);
  });

  it('survives a full round trip with markdown that contains braces', () => {
    const body = 'Use `{ "a": 1 }` in the config.\n\n- [ ] step one';
    const raw = writeMeta(body, { due: '2026-12-24' });
    const parsed = parseBody(raw);
    expect(parsed.body).toBe(body);
    expect(parsed.meta).toEqual({ due: '2026-12-24' });
  });
});

describe('updateMeta', () => {
  it('changes one field and keeps the other', () => {
    const raw = '<!-- board: {"due":"2026-01-01","estimate":"1h"} -->\n\nText.';
    const out = updateMeta(raw, { due: '2026-06-06' });
    expect(parseMeta(out)).toEqual({ due: '2026-06-06', estimate: '1h' });
  });

  it('clears a field when given an empty string', () => {
    const raw = '<!-- board: {"due":"2026-01-01","estimate":"1h"} -->\n\nText.';
    const out = updateMeta(raw, { due: '' });
    expect(parseMeta(out)).toEqual({ estimate: '1h' });
    expect(out).toContain('Text.');
  });

  it('leaves the description untouched in every case', () => {
    const body = 'Careful:\n\n    indented code\n\nend.';
    const raw = writeMeta(body, { due: '2026-01-01' });
    expect(parseBody(updateMeta(raw, { estimate: '3d' })).body).toBe(body);
  });
});

describe('isValidDue', () => {
  it('accepts real dates', () => {
    expect(isValidDue('2026-10-20')).toBe(true);
    expect(isValidDue('2028-02-29')).toBe(true); // leap year
  });
  it('rejects nonsense', () => {
    expect(isValidDue('2026-02-30')).toBe(false);
    expect(isValidDue('2026-13-01')).toBe(false);
    expect(isValidDue('20-10-2026')).toBe(false);
    expect(isValidDue('')).toBe(false);
  });
});
