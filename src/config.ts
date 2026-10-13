/**
 * The ONLY file you need to edit to point Board at your own repositories.
 *
 * Board keeps every task as an Issue in ONE private repository. The app itself
 * (this code) is public and contains no tokens, no task data and no client names.
 */

export const config = {
  /** The GitHub account or organisation that owns the private data repository. */
  dataOwner: 'Hiroki-Sebata',

  /** The private repository whose Issues are your tasks. */
  dataRepo: 'board-workspace',

  /**
   * Where this app is published. Only used to build the links that the Telegram
   * workflows send, and to show you the right address in the sign-in screen.
   * Leave the trailing slash off.
   */
  appUrl: 'https://hiroki-sebata.github.io/clickup-like-communication-system',

  /** How often to re-check GitHub for changes, in milliseconds. */
  pollVisibleMs: 30_000,
  pollHiddenMs: 5 * 60_000,

  /** Warn when the token has fewer than this many days left. */
  tokenExpiryWarningDays: 14,

  /**
   * Fallback team list. The app normally reads the real member list from the
   * repository's collaborators, so this is only used if that call is refused
   * (a fine-grained token without Metadata read, for example).
   */
  fallbackMembers: [] as string[],
} as const;

/** Convenience: "owner/repo", the way GitHub writes it. */
export const dataRepoFullName = `${config.dataOwner}/${config.dataRepo}`;

/** Set by `npm run dev:mock` — runs the whole app against fake data, no token needed. */
export const isMockMode = import.meta.env.VITE_MOCK === '1';
