/**
 * A tiny hash router.
 *
 * GitHub Pages serves static files only, so a normal URL like /board/calendar would
 * 404 on refresh. Hash URLs (#/calendar) never hit the server, which is why the
 * Telegram links are #/task/12.
 *
 * Filters live in the hash too (#/board?assignee=me&client=Acme) so you can bookmark
 * a filtered board or paste it to the other person.
 */
import { useSyncExternalStore } from 'react';

export type ScreenName = 'home' | 'board' | 'list' | 'calendar' | 'projects' | 'activity';

export const SCREENS: ScreenName[] = ['home', 'board', 'list', 'calendar', 'projects', 'activity'];

export interface Route {
  screen: ScreenName;
  /** The task number when a task panel should be open, otherwise null. */
  taskNumber: number | null;
  /** Everything after the "?" in the hash. */
  params: URLSearchParams;
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);

  if (parts[0] === 'task' && parts[1]) {
    return { screen: 'board', taskNumber: Number(parts[1]) || null, params };
  }
  const screen = (SCREENS as string[]).includes(parts[0]) ? (parts[0] as ScreenName) : 'home';
  const taskNumber = parts[1] === 'task' && parts[2] ? Number(parts[2]) || null : null;
  return { screen, taskNumber, params };
}

const subscribe = (callback: () => void) => {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
};

/** Re-renders the component whenever the hash changes. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '#/home',
  );
  return parse(hash);
}

/** Build a hash URL. */
export function href(screen: ScreenName, params?: URLSearchParams, taskNumber?: number | null): string {
  const query = params && [...params.keys()].length ? `?${params.toString()}` : '';
  const task = taskNumber ? `/task/${taskNumber}` : '';
  return `#/${screen}${task}${query}`;
}

export function go(screen: ScreenName, params?: URLSearchParams): void {
  window.location.hash = href(screen, params);
}

/** Open a task panel on top of whatever screen you are on. */
export function openTask(number: number, route: Route): void {
  window.location.hash = href(route.screen, route.params, number);
}

export function closeTask(route: Route): void {
  window.location.hash = href(route.screen, route.params, null);
}

/** Change one filter in the URL, keeping the rest. */
export function setParam(route: Route, key: string, value: string | null): void {
  const next = new URLSearchParams(route.params);
  if (value) next.set(key, value);
  else next.delete(key);
  window.location.hash = href(route.screen, next, route.taskNumber);
}
