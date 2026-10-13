/**
 * Everything Board keeps on this device, in one place.
 *
 * The token never leaves localStorage on the machine you typed it into — there is no
 * server to send it to. "Sign out and forget token" clears all of it.
 */

const KEYS = {
  token: 'board.token',
  theme: 'board.theme',
  lastOpened: 'board.lastOpened',
  tasksCache: 'board.cache.tasks',
  projectsCache: 'board.cache.projects',
  user: 'board.cache.user',
} as const;

/** localStorage throws in some private-browsing modes, so every call is guarded. */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* out of quota or blocked — the app still works, it just forgets */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export const storage = {
  getToken: () => read(KEYS.token),
  setToken: (t: string) => write(KEYS.token, t),

  getTheme: () => read(KEYS.theme) as 'light' | 'dark' | 'system' | null,
  setTheme: (t: 'light' | 'dark' | 'system') => write(KEYS.theme, t),

  /** When the app was last open, used by the "what changed" feed on Home. */
  getLastOpened: () => read(KEYS.lastOpened),
  setLastOpened: (iso: string) => write(KEYS.lastOpened, iso),

  /** Read-only copy of the last successful fetch, so the app shows something offline. */
  getCache<T>(which: 'tasks' | 'projects' | 'user'): T | null {
    const key = which === 'tasks' ? KEYS.tasksCache : which === 'projects' ? KEYS.projectsCache : KEYS.user;
    const raw = read(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  setCache(which: 'tasks' | 'projects' | 'user', value: unknown): void {
    const key = which === 'tasks' ? KEYS.tasksCache : which === 'projects' ? KEYS.projectsCache : KEYS.user;
    try {
      write(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },

  /** Sign out: forget the token and every trace of the workspace on this device. */
  forgetEverything(): void {
    Object.values(KEYS).forEach(remove);
  },
};
