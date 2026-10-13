/**
 * Due-date maths for the Home screen.
 *
 * Due dates are stored as a plain calendar day ("2026-10-20") with no time and no
 * timezone, because that is how people think about them. All comparisons here are
 * done on the *local* calendar day of whoever is looking at the screen.
 *
 * Every function takes `now` as an argument instead of calling new Date() itself,
 * so the tests can pretend it is any day they like.
 */
import type { Status, Task } from './types';

/** Local calendar day as YYYY-MM-DD. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Turn "2026-10-20" into a Date at local midnight (NOT UTC midnight). */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * The last day of the week that `now` falls in. Weeks run Monday to Sunday,
 * which is what both of you use in Europe.
 */
export function endOfWeek(now: Date): string {
  const day = now.getDay(); // 0 = Sunday
  const daysToSunday = day === 0 ? 0 : 7 - day;
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToSunday);
  return toISODate(end);
}

/** Whole days from `now`'s day to the ISO date. Negative means in the past. */
export function daysUntil(iso: string, now: Date): number {
  const a = fromISODate(toISODate(now)).getTime();
  const b = fromISODate(iso).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** "Overdue by 3 days", "Today", "Tomorrow", "In 4 days", "20 Oct". */
export function describeDue(iso: string, now: Date): string {
  const d = daysUntil(iso, now);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d < 0) return `${Math.abs(d)} days ago`;
  if (d <= 7) return `In ${d} days`;
  return fromISODate(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** A task is "live" if it is not finished. Done tasks never appear in a due bucket. */
const isLive = (t: Task) => t.status !== 'done' && t.state === 'open';

export interface HomeBuckets {
  /** Mine, with a due date before today. */
  overdue: Task[];
  /** Mine, due today. */
  dueToday: Task[];
  /** Mine, due after today but no later than Sunday of this week. */
  dueThisWeek: Task[];
  /** In review and not assigned to me — so it is my eyes that are needed. */
  waitingOnMyReview: Task[];
  /** Live tasks nobody has picked up. */
  unassigned: Task[];
}

/**
 * Split the whole task list into the five Home sections.
 *
 * A task can legitimately appear in more than one section (an unassigned task in
 * review shows under both), because each section answers a different question.
 */
export function groupForHome(tasks: Task[], me: string, now: Date): HomeBuckets {
  const today = toISODate(now);
  const weekEnd = endOfWeek(now);
  const mine = (t: Task) => t.assignees.includes(me);

  const byDue = (a: Task, b: Task) => (a.meta.due ?? '').localeCompare(b.meta.due ?? '');
  const byUpdated = (a: Task, b: Task) => b.updatedAt.localeCompare(a.updatedAt);

  const live = tasks.filter(isLive);

  return {
    overdue: live.filter((t) => mine(t) && t.meta.due && t.meta.due < today).sort(byDue),
    dueToday: live.filter((t) => mine(t) && t.meta.due === today).sort(byDue),
    dueThisWeek: live
      .filter((t) => mine(t) && t.meta.due && t.meta.due > today && t.meta.due <= weekEnd)
      .sort(byDue),
    waitingOnMyReview: live
      .filter((t) => t.status === 'review' && !t.assignees.includes(me))
      .sort(byUpdated),
    unassigned: live.filter((t) => t.assignees.length === 0).sort(byUpdated),
  };
}

/** Used by the Calendar screen: every task that has a due date in the given month. */
export function tasksOnDay(tasks: Task[], iso: string): Task[] {
  return tasks.filter((t) => t.meta.due === iso);
}

/** Simple status ordering helper shared by the List screen. */
export const STATUS_ORDER: Record<Status, number> = {
  todo: 0,
  'in progress': 1,
  review: 2,
  done: 3,
};
