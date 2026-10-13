import { describe, it, expect } from 'vitest';
import {
  changeStatus,
  changePriority,
  changeClient,
  statusFromLabels,
  priorityFromLabels,
  clientFromLabels,
  otherLabels,
  reopenToTodo,
  REQUIRED_LABELS,
} from '../lib/labels';

describe('reading labels', () => {
  it('finds the status', () => {
    expect(statusFromLabels(['status: in progress', 'priority: high'], 'open')).toBe('in progress');
  });

  it('falls back to done for a closed issue with no status label', () => {
    expect(statusFromLabels(['priority: low'], 'closed')).toBe('done');
  });

  it('falls back to todo for an open issue with no status label', () => {
    expect(statusFromLabels([], 'open')).toBe('todo');
  });

  it('picks the furthest-along status if two somehow got applied', () => {
    expect(statusFromLabels(['status: todo', 'status: review'], 'open')).toBe('review');
  });

  it('reads priority and client, and ignores unrelated labels', () => {
    const labels = ['status: todo', 'priority: urgent', 'client: Acme Dental', 'bug', 'needs copy'];
    expect(priorityFromLabels(labels)).toBe('urgent');
    expect(clientFromLabels(labels)).toBe('Acme Dental');
    expect(otherLabels(labels)).toEqual(['bug', 'needs copy']);
  });

  it('returns null when there is no priority or client', () => {
    expect(priorityFromLabels(['status: todo'])).toBeNull();
    expect(clientFromLabels(['status: todo'])).toBeNull();
  });
});

describe('changeStatus', () => {
  it('swaps the status label and keeps everything else', () => {
    const r = changeStatus(['status: todo', 'priority: high', 'client: Acme'], 'open', 'in progress');
    expect(r.labels.sort()).toEqual(['client: Acme', 'priority: high', 'status: in progress'].sort());
    expect(r.state).toBeNull();
    expect(r.stateReason).toBeNull();
  });

  it('closes the issue when moving to done', () => {
    const r = changeStatus(['status: review'], 'open', 'done');
    expect(r.labels).toEqual(['status: done']);
    expect(r.state).toBe('closed');
    expect(r.stateReason).toBe('completed');
  });

  it('does not try to close an already closed issue', () => {
    const r = changeStatus(['status: done'], 'closed', 'done');
    expect(r.state).toBeNull();
    expect(r.stateReason).toBeNull();
  });

  it('reopens the issue when moving away from done', () => {
    const r = changeStatus(['status: done'], 'closed', 'in progress');
    expect(r.labels).toEqual(['status: in progress']);
    expect(r.state).toBe('open');
    expect(r.stateReason).toBe('reopened');
  });

  it('adds a status label to an issue that had none', () => {
    const r = changeStatus(['bug'], 'open', 'review');
    expect(r.labels).toEqual(['bug', 'status: review']);
  });

  it('never leaves two status labels behind', () => {
    const r = changeStatus(['status: todo', 'status: review'], 'open', 'done');
    expect(r.labels.filter((l) => l.startsWith('status: '))).toEqual(['status: done']);
  });

  it('walks the whole board without losing the other labels', () => {
    let labels = ['priority: normal', 'client: Acme', 'design'];
    let state: 'open' | 'closed' = 'open';
    for (const next of ['in progress', 'review', 'done'] as const) {
      const r = changeStatus(labels, state, next);
      labels = r.labels;
      if (r.state) state = r.state;
    }
    expect(state).toBe('closed');
    expect(labels.sort()).toEqual(['client: Acme', 'design', 'priority: normal', 'status: done'].sort());

    // ...and back again
    const back = changeStatus(labels, state, 'todo');
    expect(back.state).toBe('open');
    expect(back.labels).toContain('client: Acme');
    expect(back.labels).toContain('status: todo');
  });
});

describe('reopenToTodo', () => {
  it('puts a reopened issue back to todo', () => {
    expect(reopenToTodo(['status: done', 'priority: low'])).toEqual(['priority: low', 'status: todo']);
  });
});

describe('changePriority and changeClient', () => {
  it('swaps the priority', () => {
    expect(changePriority(['status: todo', 'priority: low'], 'urgent')).toEqual([
      'status: todo',
      'priority: urgent',
    ]);
  });
  it('removes the priority when set to null', () => {
    expect(changePriority(['status: todo', 'priority: low'], null)).toEqual(['status: todo']);
  });
  it('swaps the client, including names with spaces', () => {
    expect(changeClient(['client: Old Co'], 'New Co Ltd')).toEqual(['client: New Co Ltd']);
  });
  it('removes the client when set to null', () => {
    expect(changeClient(['status: todo', 'client: Old Co'], null)).toEqual(['status: todo']);
  });
});

describe('REQUIRED_LABELS', () => {
  it('lists the four statuses and four priorities', () => {
    expect(REQUIRED_LABELS).toHaveLength(8);
    expect(REQUIRED_LABELS).toContain('status: todo');
    expect(REQUIRED_LABELS).toContain('status: in progress');
    expect(REQUIRED_LABELS).toContain('status: review');
    expect(REQUIRED_LABELS).toContain('status: done');
    expect(REQUIRED_LABELS).toContain('priority: urgent');
    expect(REQUIRED_LABELS).toContain('priority: low');
  });
});
