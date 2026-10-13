/** A sortable table. Click a column heading to sort, click again to reverse. */
import { useMemo, useState } from 'react';
import { STATUS_ORDER } from '../lib/dates';
import type { Route } from '../lib/router';
import { useWorkspace } from '../state/store';
import { Filters, filterTasks } from '../components/Filters';
import { Avatars, DueChip, PriorityChip, StatusChip, Empty } from '../components/bits';
import type { Task } from '../lib/types';

type Column = 'number' | 'title' | 'status' | 'assignee' | 'priority' | 'client' | 'project' | 'due';

const HEADINGS: Array<{ key: Column; label: string; narrowHide?: boolean }> = [
  { key: 'number', label: '#' },
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'priority', label: 'Priority', narrowHide: true },
  { key: 'client', label: 'Client', narrowHide: true },
  { key: 'project', label: 'Project', narrowHide: true },
  { key: 'due', label: 'Due' },
];

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export function List({
  route,
  search,
  onOpen,
  now,
}: {
  route: Route;
  search: string;
  onOpen: (n: number) => void;
  now: Date;
}) {
  const { tasks, me, members } = useWorkspace();
  const [sort, setSort] = useState<{ key: Column; desc: boolean }>({ key: 'due', desc: false });

  const rows = useMemo(() => {
    const filtered = filterTasks(tasks, route, me, search, { includeDone: true });
    const value = (t: Task): string | number => {
      switch (sort.key) {
        case 'number': return t.number;
        case 'title': return t.title.toLowerCase();
        case 'status': return STATUS_ORDER[t.status];
        case 'assignee': return (t.assignees[0] ?? '~').toLowerCase();
        case 'priority': return PRIORITY_RANK[t.priority ?? 'normal'] ?? 2;
        case 'client': return (t.client ?? '~').toLowerCase();
        case 'project': return (t.milestone?.title ?? '~').toLowerCase();
        // Tasks with no due date sort to the bottom, never to the top.
        case 'due': return t.meta.due ?? '9999-99-99';
      }
    };
    return [...filtered].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return sort.desc ? -cmp : cmp;
    });
  }, [tasks, route, me, search, sort]);

  function toggle(key: Column) {
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: false }));
  }

  return (
    <div>
      <Filters route={route} showStatus />
      <div className="glass" style={{ padding: 4, overflow: 'auto' }}>
        <table>
          <thead>
            <tr>
              {HEADINGS.map((h) => (
                <th
                  key={h.key}
                  onClick={() => toggle(h.key)}
                  className={h.narrowHide ? 'hide-narrow' : undefined}
                  aria-sort={sort.key === h.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}
                >
                  {h.label}
                  {sort.key === h.key ? (sort.desc ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.number} onClick={() => onOpen(t.number)} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onOpen(t.number); }}>
                <td className="faint">{t.number}</td>
                <td style={{ fontWeight: 550, minWidth: 220 }}>{t.title}</td>
                <td><StatusChip status={t.status} /></td>
                <td><Avatars logins={t.assignees} members={members} /></td>
                <td className="hide-narrow"><PriorityChip priority={t.priority} /></td>
                <td className="hide-narrow">{t.client ?? <span className="faint">—</span>}</td>
                <td className="hide-narrow">{t.milestone?.title ?? <span className="faint">—</span>}</td>
                <td>{t.meta.due ? <DueChip due={t.meta.due} now={now} /> : <span className="faint">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <Empty>No tasks match these filters.</Empty> : null}
      </div>
    </div>
  );
}
