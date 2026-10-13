import { describe, it, expect } from 'vitest';
import { groupForHome, endOfWeek, daysUntil, toISODate, describeDue } from '../lib/dates';
import type { Task } from '../lib/types';

/** Build a task with only the fields the grouping cares about. */
function task(partial: Partial<Task> & { number: number }): Task {
  return {
    title: `Task ${partial.number}`,
    body: '',
    rawBody: '',
    state: 'open',
    status: 'todo',
    priority: null,
    client: null,
    otherLabels: [],
    assignees: [],
    milestone: null,
    meta: {},
    comments: 0,
    createdAt: '2026-10-01T09:00:00Z',
    updatedAt: '2026-10-01T09:00:00Z',
    author: 'someone',
    htmlUrl: '',
    ...partial,
  };
}

// Wednesday 14 October 2026, local time.
const WED = new Date(2026, 9, 14, 11, 0, 0);

describe('endOfWeek', () => {
  it('returns the coming Sunday for a midweek day', () => {
    expect(endOfWeek(WED)).toBe('2026-10-18');
  });
  it('returns today when today is Sunday', () => {
    const sunday = new Date(2026, 9, 18, 9, 0, 0);
    expect(endOfWeek(sunday)).toBe('2026-10-18');
  });
  it('returns the end of the same week for a Monday', () => {
    const monday = new Date(2026, 9, 12, 9, 0, 0);
    expect(endOfWeek(monday)).toBe('2026-10-18');
  });
});

describe('daysUntil', () => {
  it('ignores the time of day', () => {
    expect(daysUntil('2026-10-14', new Date(2026, 9, 14, 23, 59))).toBe(0);
    expect(daysUntil('2026-10-15', new Date(2026, 9, 14, 0, 1))).toBe(1);
    expect(daysUntil('2026-10-13', WED)).toBe(-1);
  });
  it('is correct across a daylight-saving change', () => {
    // Clocks go back in Europe on 25 October 2026.
    const before = new Date(2026, 9, 24, 12, 0);
    expect(daysUntil('2026-10-26', before)).toBe(2);
  });
  it('is correct across a month boundary', () => {
    expect(daysUntil('2026-11-02', new Date(2026, 9, 31, 8, 0))).toBe(2);
  });
});

describe('groupForHome', () => {
  const me = 'hiroki';
  const other = 'partner';

  const tasks: Task[] = [
    task({ number: 1, assignees: [me], meta: { due: '2026-10-10' } }),            // overdue
    task({ number: 2, assignees: [me], meta: { due: '2026-10-13' } }),            // overdue (yesterday)
    task({ number: 3, assignees: [me], meta: { due: '2026-10-14' } }),            // today
    task({ number: 4, assignees: [me], meta: { due: '2026-10-16' } }),            // this week
    task({ number: 5, assignees: [me], meta: { due: '2026-10-18' } }),            // this week (Sunday)
    task({ number: 6, assignees: [me], meta: { due: '2026-10-19' } }),            // next week -> nowhere
    task({ number: 7, assignees: [other], meta: { due: '2026-10-10' } }),         // not mine
    task({ number: 8, assignees: [me] }),                                          // mine, no due date
    task({ number: 9, assignees: [other], status: 'review' }),                     // waiting on me
    task({ number: 10, assignees: [me], status: 'review' }),                       // my own review, not mine to review
    task({ number: 11 }),                                                          // unassigned
    task({ number: 12, status: 'review' }),                                        // unassigned AND in review
    task({
      number: 13,
      assignees: [me],
      status: 'done',
      state: 'closed',
      meta: { due: '2026-10-10' },
    }),                                                                            // done, never shown
  ];

  const g = groupForHome(tasks, me, WED);
  const nums = (list: Task[]) => list.map((t) => t.number);

  it('puts my past-due tasks in overdue, oldest first', () => {
    expect(nums(g.overdue)).toEqual([1, 2]);
  });

  it('puts only today in due today', () => {
    expect(nums(g.dueToday)).toEqual([3]);
  });

  it('counts the rest of this week, up to and including Sunday', () => {
    expect(nums(g.dueThisWeek)).toEqual([4, 5]);
  });

  it('does not reach into next week', () => {
    expect(nums(g.dueThisWeek)).not.toContain(6);
  });

  it('shows review tasks that are not mine to do', () => {
    expect(nums(g.waitingOnMyReview)).toContain(9);
    expect(nums(g.waitingOnMyReview)).toContain(12);
    expect(nums(g.waitingOnMyReview)).not.toContain(10);
  });

  it('lists unassigned live tasks', () => {
    expect(nums(g.unassigned).sort((a, b) => a - b)).toEqual([11, 12]);
  });

  it('never shows a finished task anywhere', () => {
    const all = [...g.overdue, ...g.dueToday, ...g.dueThisWeek, ...g.waitingOnMyReview, ...g.unassigned];
    expect(all.map((t) => t.number)).not.toContain(13);
  });

  it('ignores tasks with no due date in the date buckets', () => {
    const all = [...g.overdue, ...g.dueToday, ...g.dueThisWeek];
    expect(all.map((t) => t.number)).not.toContain(8);
  });

  it('gives empty buckets rather than crashing on an empty list', () => {
    const empty = groupForHome([], me, WED);
    expect(empty.overdue).toEqual([]);
    expect(empty.unassigned).toEqual([]);
  });

  it('on a Sunday, this week is empty because Sunday is today', () => {
    const sunday = new Date(2026, 9, 18, 10, 0);
    const gs = groupForHome(tasks, me, sunday);
    expect(gs.dueThisWeek).toEqual([]);
    expect(nums(gs.dueToday)).toEqual([5]);
  });
});

describe('describeDue', () => {
  it('uses friendly words for nearby days', () => {
    expect(describeDue('2026-10-14', WED)).toBe('Today');
    expect(describeDue('2026-10-15', WED)).toBe('Tomorrow');
    expect(describeDue('2026-10-13', WED)).toBe('Yesterday');
    expect(describeDue('2026-10-11', WED)).toBe('3 days ago');
    expect(describeDue('2026-10-18', WED)).toBe('In 4 days');
  });
});

describe('toISODate', () => {
  it('uses the local day, not the UTC day', () => {
    // 23:30 local on the 14th is still the 14th, even if UTC has rolled over.
    expect(toISODate(new Date(2026, 9, 14, 23, 30))).toBe('2026-10-14');
    expect(toISODate(new Date(2026, 9, 14, 0, 30))).toBe('2026-10-14');
  });
});
