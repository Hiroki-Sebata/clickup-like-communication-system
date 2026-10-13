/**
 * "Someone else changed this while I had it open."
 *
 * Both of you can have the same task open. Before Board saves an edit it fetches the
 * issue again and compares it with the version that was on screen when the edit
 * started. If the other person touched a field that this edit also touches, we stop
 * and show both versions instead of silently overwriting their work.
 *
 * The comparison is per field, deliberately: if they changed the priority while I was
 * rewriting the description, there is no conflict and the save goes ahead.
 */
import type { Task } from './types';

/** The fields Board can edit. */
export type EditableField =
  | 'title'
  | 'body'
  | 'status'
  | 'priority'
  | 'client'
  | 'assignees'
  | 'milestone'
  | 'due'
  | 'estimate';

export const FIELD_LABELS: Record<EditableField, string> = {
  title: 'Title',
  body: 'Description',
  status: 'Status',
  priority: 'Priority',
  client: 'Client',
  assignees: 'Assignees',
  milestone: 'Project',
  due: 'Due date',
  estimate: 'Estimate',
};

export interface FieldConflict {
  field: EditableField;
  /** What the field looked like when I opened the task. */
  base: string;
  /** What it looks like on GitHub right now. */
  theirs: string;
  /** What I am trying to save. */
  mine: string;
}

/** Turn a field into a plain string so we can compare and display it. */
export function readField(task: Task, field: EditableField): string {
  switch (field) {
    case 'title':
      return task.title;
    case 'body':
      return task.body;
    case 'status':
      return task.status;
    case 'priority':
      return task.priority ?? '';
    case 'client':
      return task.client ?? '';
    case 'assignees':
      // Sorted so that a different ordering from the API is not read as a change.
      return [...task.assignees].sort().join(', ');
    case 'milestone':
      return task.milestone ? task.milestone.title : '';
    case 'due':
      return task.meta.due ?? '';
    case 'estimate':
      return task.meta.estimate ?? '';
  }
}

/**
 * Compare three versions of the task and report the real clashes.
 *
 * @param base    the task as it was when the edit started
 * @param latest  the task as GitHub has it right now
 * @param patch   the fields this edit wants to change, as display strings
 */
export function detectConflicts(
  base: Task,
  latest: Task,
  patch: Partial<Record<EditableField, string>>,
): FieldConflict[] {
  const conflicts: FieldConflict[] = [];

  for (const key of Object.keys(patch) as EditableField[]) {
    const mine = patch[key] ?? '';
    const baseValue = readField(base, key);
    const theirs = readField(latest, key);

    // They did not touch it -> no conflict, whatever I am doing.
    if (theirs === baseValue) continue;
    // They changed it to exactly what I want -> nothing to argue about.
    if (theirs === mine) continue;
    // I am not actually changing it -> let their version stand.
    if (mine === baseValue) continue;

    conflicts.push({ field: key, base: baseValue, theirs, mine });
  }

  return conflicts;
}

/**
 * A cheap first check before doing the per-field work: if updated_at has not moved,
 * nobody has touched the issue and we can save straight away.
 */
export function hasChangedSince(base: Task, latest: Task): boolean {
  return base.updatedAt !== latest.updatedAt;
}

/** Which side the person picked in the conflict dialog. */
export type Resolution = 'mine' | 'theirs';

/**
 * Apply the person's choice: keep only the fields they decided to overwrite.
 * Fields they gave up on are dropped from the patch so the other person's value stays.
 */
export function resolveConflicts(
  patch: Partial<Record<EditableField, string>>,
  conflicts: FieldConflict[],
  choices: Record<string, Resolution>,
): Partial<Record<EditableField, string>> {
  const result = { ...patch };
  for (const c of conflicts) {
    if (choices[c.field] === 'theirs') delete result[c.field];
  }
  return result;
}
