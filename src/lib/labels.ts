/**
 * Status, priority and client are all GitHub labels. This file owns the naming
 * rules and the "what happens when I move a task" logic, so that the Board screen,
 * the List screen and the task panel all behave identically.
 */
import type { Priority, Status } from './types';

export const STATUS_PREFIX = 'status: ';
export const PRIORITY_PREFIX = 'priority: ';
export const CLIENT_PREFIX = 'client: ';

/** Column order, left to right. */
export const STATUSES: Status[] = ['todo', 'in progress', 'review', 'done'];
export const PRIORITIES: Priority[] = ['urgent', 'high', 'normal', 'low'];

export const statusLabel = (s: Status) => `${STATUS_PREFIX}${s}`;
export const priorityLabel = (p: Priority) => `${PRIORITY_PREFIX}${p}`;
export const clientLabel = (name: string) => `${CLIENT_PREFIX}${name}`;

/** Human-friendly column headings. */
export const STATUS_TITLES: Record<Status, string> = {
  todo: 'To do',
  'in progress': 'In progress',
  review: 'Review',
  done: 'Done',
};

/**
 * Label colours, created on first run so both of you see the same thing.
 * GitHub wants six hex digits with no "#".
 */
export const LABEL_COLOURS: Record<string, string> = {
  'status: todo': '8b95a5',
  'status: in progress': '4f6ff5',
  'status: review': 'c026d3',
  'status: done': '16a34a',
  'priority: urgent': 'dc2626',
  'priority: high': 'ea580c',
  'priority: normal': '0ea5e9',
  'priority: low': '64748b',
};

export const LABEL_DESCRIPTIONS: Record<string, string> = {
  'status: todo': 'Not started yet',
  'status: in progress': 'Someone is working on it',
  'status: review': 'Waiting for a second pair of eyes',
  'status: done': 'Finished (the issue is closed)',
  'priority: urgent': 'Drop everything',
  'priority: high': 'Next up',
  'priority: normal': 'Normal priority',
  'priority: low': 'Nice to have',
};

/** Every label Board needs to exist in the data repository. */
export const REQUIRED_LABELS = Object.keys(LABEL_COLOURS);

/** The colour used for a "client: ..." label we create on the fly. */
export const CLIENT_LABEL_COLOUR = '7c3aed';

// --- reading ---------------------------------------------------------------

/**
 * Exactly one status label is supposed to be present. If an issue somehow has two
 * (two people moved it at once), we take the furthest-along one so the task does
 * not bounce backwards. If it has none, a closed issue counts as done and an open
 * one counts as todo.
 */
export function statusFromLabels(labels: string[], state: 'open' | 'closed'): Status {
  const found = STATUSES.filter((s) => labels.includes(statusLabel(s)));
  if (found.length > 0) {
    // STATUSES is in order, so the last match is the furthest along.
    return found[found.length - 1];
  }
  return state === 'closed' ? 'done' : 'todo';
}

export function priorityFromLabels(labels: string[]): Priority | null {
  for (const p of PRIORITIES) if (labels.includes(priorityLabel(p))) return p;
  return null;
}

export function clientFromLabels(labels: string[]): string | null {
  const hit = labels.find((l) => l.startsWith(CLIENT_PREFIX));
  return hit ? hit.slice(CLIENT_PREFIX.length) : null;
}

/** Labels that are not managed by Board, so we can leave them untouched. */
export function otherLabels(labels: string[]): string[] {
  return labels.filter(
    (l) =>
      !l.startsWith(STATUS_PREFIX) &&
      !l.startsWith(PRIORITY_PREFIX) &&
      !l.startsWith(CLIENT_PREFIX),
  );
}

// --- writing ---------------------------------------------------------------

export interface StatusChange {
  /** The complete label list to send to GitHub. */
  labels: string[];
  /** The issue state to send, or null if it should not change. */
  state: 'open' | 'closed' | null;
  /** Set when we close the issue, so GitHub records the right reason. */
  stateReason: 'completed' | 'reopened' | null;
}

/**
 * Work out the full update for moving a task to `next`.
 *
 * The two rules from the spec:
 *  - moving to "done" also closes the issue;
 *  - reopening a closed issue puts it back to "todo".
 */
export function changeStatus(
  currentLabels: string[],
  currentState: 'open' | 'closed',
  next: Status,
): StatusChange {
  const labels = [
    ...currentLabels.filter((l) => !l.startsWith(STATUS_PREFIX)),
    statusLabel(next),
  ];

  if (next === 'done') {
    return {
      labels,
      state: currentState === 'closed' ? null : 'closed',
      stateReason: currentState === 'closed' ? null : 'completed',
    };
  }

  // Any status other than done means the task is live again.
  return {
    labels,
    state: currentState === 'open' ? null : 'open',
    stateReason: currentState === 'open' ? null : 'reopened',
  };
}

/**
 * What to do when someone reopens the issue on github.com rather than in Board.
 * The spec says: reopening sets the status back to todo.
 */
export function reopenToTodo(currentLabels: string[]): string[] {
  return [...currentLabels.filter((l) => !l.startsWith(STATUS_PREFIX)), statusLabel('todo')];
}

/** Swap the priority label, leaving everything else alone. */
export function changePriority(currentLabels: string[], next: Priority | null): string[] {
  const kept = currentLabels.filter((l) => !l.startsWith(PRIORITY_PREFIX));
  return next ? [...kept, priorityLabel(next)] : kept;
}

/** Swap the client label, leaving everything else alone. */
export function changeClient(currentLabels: string[], next: string | null): string[] {
  const kept = currentLabels.filter((l) => !l.startsWith(CLIENT_PREFIX));
  return next ? [...kept, clientLabel(next)] : kept;
}
