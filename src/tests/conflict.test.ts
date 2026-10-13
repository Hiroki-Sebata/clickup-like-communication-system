import { describe, it, expect } from 'vitest';
import {
  detectConflicts,
  hasChangedSince,
  readField,
  resolveConflicts,
} from '../lib/conflict';
import type { Task } from '../lib/types';

function task(partial: Partial<Task> = {}): Task {
  return {
    number: 7,
    title: 'Homepage hero',
    body: 'Original description.',
    rawBody: 'Original description.',
    state: 'open',
    status: 'todo',
    priority: 'normal',
    client: 'Acme',
    otherLabels: [],
    assignees: ['hiroki'],
    milestone: null,
    meta: { due: '2026-10-20', estimate: '2h' },
    comments: 0,
    createdAt: '2026-10-01T09:00:00Z',
    updatedAt: '2026-10-10T09:00:00Z',
    author: 'hiroki',
    htmlUrl: '',
    ...partial,
  };
}

describe('hasChangedSince', () => {
  it('is false when nobody touched the issue', () => {
    expect(hasChangedSince(task(), task())).toBe(false);
  });
  it('is true when updated_at moved', () => {
    expect(hasChangedSince(task(), task({ updatedAt: '2026-10-11T09:00:00Z' }))).toBe(true);
  });
});

describe('detectConflicts', () => {
  const base = task();

  it('reports nothing when the other person changed a different field', () => {
    const latest = task({ priority: 'urgent', updatedAt: '2026-10-11T09:00:00Z' });
    const conflicts = detectConflicts(base, latest, { title: 'New title' });
    expect(conflicts).toEqual([]);
  });

  it('reports a clash when we both edited the same field', () => {
    const latest = task({ title: 'Their title', updatedAt: '2026-10-11T09:00:00Z' });
    const conflicts = detectConflicts(base, latest, { title: 'My title' });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toEqual({
      field: 'title',
      base: 'Homepage hero',
      theirs: 'Their title',
      mine: 'My title',
    });
  });

  it('reports nothing when we both made the same change', () => {
    const latest = task({ status: 'review' });
    expect(detectConflicts(base, latest, { status: 'review' })).toEqual([]);
  });

  it('reports nothing when my patch does not actually change anything', () => {
    const latest = task({ title: 'Their title' });
    expect(detectConflicts(base, latest, { title: 'Homepage hero' })).toEqual([]);
  });

  it('reports several clashes at once', () => {
    const latest = task({
      title: 'Their title',
      status: 'review',
      meta: { due: '2026-11-01', estimate: '2h' },
    });
    const conflicts = detectConflicts(base, latest, {
      title: 'My title',
      status: 'in progress',
      due: '2026-10-25',
      estimate: '2h',
    });
    expect(conflicts.map((c) => c.field).sort()).toEqual(['due', 'status', 'title']);
  });

  it('does not treat a reordered assignee list as a change', () => {
    const b = task({ assignees: ['hiroki', 'partner'] });
    const latest = task({ assignees: ['partner', 'hiroki'] });
    expect(detectConflicts(b, latest, { assignees: 'hiroki, partner' })).toEqual([]);
  });

  it('spots a real assignee change', () => {
    const latest = task({ assignees: ['partner'] });
    const conflicts = detectConflicts(base, latest, { assignees: 'hiroki, partner' });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].theirs).toBe('partner');
  });

  it('handles the due date being cleared by the other person', () => {
    const latest = task({ meta: { estimate: '2h' } });
    const conflicts = detectConflicts(base, latest, { due: '2026-12-01' });
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].theirs).toBe('');
    expect(conflicts[0].base).toBe('2026-10-20');
  });

  it('handles the description, which is the most likely thing to clash', () => {
    const latest = task({ body: 'They rewrote it.' });
    const conflicts = detectConflicts(base, latest, { body: 'I rewrote it.' });
    expect(conflicts[0].field).toBe('body');
  });
});

describe('readField', () => {
  it('turns every editable field into a plain string', () => {
    const t = task({ milestone: { number: 1, title: 'Website v2', description: null, dueOn: null, openIssues: 1, closedIssues: 0, state: 'open' } });
    expect(readField(t, 'milestone')).toBe('Website v2');
    expect(readField(task({ milestone: null }), 'milestone')).toBe('');
    expect(readField(task({ priority: null }), 'priority')).toBe('');
    expect(readField(t, 'estimate')).toBe('2h');
  });
});

describe('resolveConflicts', () => {
  it('drops the fields where I chose their version', () => {
    const patch = { title: 'My title', status: 'in progress' };
    const conflicts = detectConflicts(
      task(),
      task({ title: 'Their title', status: 'review' }),
      patch,
    );
    const resolved = resolveConflicts(patch, conflicts, { title: 'theirs', status: 'mine' });
    expect(resolved).toEqual({ status: 'in progress' });
  });

  it('keeps everything when I choose my version throughout', () => {
    const patch = { title: 'My title' };
    const conflicts = detectConflicts(task(), task({ title: 'Theirs' }), patch);
    expect(resolveConflicts(patch, conflicts, { title: 'mine' })).toEqual(patch);
  });
});
