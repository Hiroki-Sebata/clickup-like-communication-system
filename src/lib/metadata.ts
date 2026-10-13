/**
 * Due date and time estimate are not real GitHub fields, so Board keeps them in a
 * hidden HTML comment at the very top of the issue description:
 *
 *   <!-- board: {"due":"2026-10-20","estimate":"2h"} -->
 *
 * GitHub does not render HTML comments, so a person reading the issue on github.com
 * just sees their own text. The rules below exist so that editing the due date never
 * disturbs a single character of the description the person wrote.
 */
import type { BoardMeta } from './types';

/**
 * Matches the block anywhere in the body (we write it at the top, but an issue created
 * by hand, or by an older version, might have it elsewhere). Non-greedy so the first
 * "-->" ends it.
 */
const BLOCK = /<!--\s*board:\s*(\{[\s\S]*?\})\s*-->/;

export interface ParsedBody {
  /** What the block said. Empty object if there was no block or it was broken. */
  meta: BoardMeta;
  /** The description with the block (and the blank line after it) removed. */
  body: string;
  /** True if a block was actually found — useful for tests and debugging. */
  hadBlock: boolean;
}

/** Read the hidden block out of an issue body. Never throws. */
export function parseBody(rawBody: string | null | undefined): ParsedBody {
  const raw = rawBody ?? '';
  const match = raw.match(BLOCK);
  if (!match) return { meta: {}, body: raw.trim(), hadBlock: false };

  let meta: BoardMeta = {};
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    // Only take the two fields we know about, and only if they are strings.
    if (parsed && typeof parsed === 'object') {
      const o = parsed as Record<string, unknown>;
      if (typeof o.due === 'string' && o.due) meta.due = o.due;
      if (typeof o.estimate === 'string' && o.estimate) meta.estimate = o.estimate;
    }
  } catch {
    // A broken block is treated as "no metadata" rather than breaking the whole app.
    meta = {};
  }

  // Remove the block and any blank line it left behind.
  const body = raw.replace(BLOCK, '').replace(/^\s*\n/, '').trim();
  return { meta, body, hadBlock: true };
}

/** Just the metadata, for callers that do not care about the text. */
export function parseMeta(rawBody: string | null | undefined): BoardMeta {
  return parseBody(rawBody).meta;
}

/**
 * Put `meta` back into `rawBody`, leaving the human-written description alone.
 * If the metadata is empty the block is removed entirely, so we never leave
 * `<!-- board: {} -->` lying around.
 */
export function writeMeta(rawBody: string | null | undefined, meta: BoardMeta): string {
  const { body } = parseBody(rawBody);

  // Build the object with a stable key order so saving twice produces the same text
  // and GitHub does not record a pointless edit.
  const clean: BoardMeta = {};
  if (meta.due) clean.due = meta.due;
  if (meta.estimate) clean.estimate = meta.estimate;

  if (Object.keys(clean).length === 0) return body;

  const block = `<!-- board: ${JSON.stringify(clean)} -->`;
  return body ? `${block}\n\n${body}` : block;
}

/** Change one or two fields without touching the others. */
export function updateMeta(
  rawBody: string | null | undefined,
  patch: Partial<BoardMeta>,
): string {
  const current = parseMeta(rawBody);
  const next: BoardMeta = { ...current };
  // `undefined` in the patch means "leave it"; `null`/"" means "clear it".
  for (const key of ['due', 'estimate'] as const) {
    if (key in patch) {
      const value = patch[key];
      if (value) next[key] = value;
      else delete next[key];
    }
  }
  return writeMeta(rawBody, next);
}

/** True if the string looks like YYYY-MM-DD and is a real calendar date. */
export function isValidDue(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}
