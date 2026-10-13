/**
 * The filter strip used by Board, List and Calendar.
 *
 * Every filter is written into the URL hash, so a filtered view can be bookmarked
 * or pasted to the other person and it opens exactly the same for them.
 */
import { setParam, type Route } from '../lib/router';
import { PRIORITIES, STATUS_TITLES, STATUSES } from '../lib/labels';
import { useWorkspace } from '../state/store';
import type { Task } from '../lib/types';

export function Filters({ route, showStatus = false }: { route: Route; showStatus?: boolean }) {
  const { members, clients, projects, me } = useWorkspace();
  const p = route.params;

  const active = ['assignee', 'client', 'project', 'priority', 'status'].filter((k) => p.get(k));

  return (
    <div className="glass row" style={{ padding: '8px 11px', marginBottom: 11, flexWrap: 'wrap' }}>
      <Select
        label="Assignee"
        value={p.get('assignee') ?? ''}
        onChange={(v) => setParam(route, 'assignee', v)}
        options={[
          { value: 'me', label: 'Me' },
          { value: 'none', label: 'Unassigned' },
          ...members.filter((m) => m.login !== me).map((m) => ({ value: m.login, label: m.login })),
        ]}
      />
      <Select
        label="Client"
        value={p.get('client') ?? ''}
        onChange={(v) => setParam(route, 'client', v)}
        options={clients.map((c) => ({ value: c, label: c }))}
      />
      <Select
        label="Project"
        value={p.get('project') ?? ''}
        onChange={(v) => setParam(route, 'project', v)}
        options={projects.map((m) => ({ value: String(m.number), label: m.title }))}
      />
      <Select
        label="Priority"
        value={p.get('priority') ?? ''}
        onChange={(v) => setParam(route, 'priority', v)}
        options={PRIORITIES.map((x) => ({ value: x, label: x }))}
      />
      {showStatus ? (
        <Select
          label="Status"
          value={p.get('status') ?? ''}
          onChange={(v) => setParam(route, 'status', v)}
          options={STATUSES.map((s) => ({ value: s, label: STATUS_TITLES[s] }))}
        />
      ) : null}

      {active.length > 0 ? (
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => active.forEach((k) => setParam(route, k, null))}
        >
          Clear {active.length} filter{active.length > 1 ? 's' : ''}
        </button>
      ) : null}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string | null) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
      <span className="faint">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value || null)}
        style={{ width: 'auto', padding: '5px 8px', fontSize: 12.5 }}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Apply the URL filters plus the search box to the task list.
 * Shared by every screen so they always agree with each other.
 */
export function filterTasks(
  tasks: Task[],
  route: Route,
  me: string,
  search: string,
  options: { includeDone?: boolean } = {},
): Task[] {
  const p = route.params;
  const assignee = p.get('assignee');
  const client = p.get('client');
  const project = p.get('project');
  const priority = p.get('priority');
  const status = p.get('status');
  const needle = search.trim().toLowerCase();

  return tasks.filter((t) => {
    if (!options.includeDone && t.status === 'done' && !status) {
      // Done tasks are hidden unless you ask for them — otherwise the list grows
      // forever and the board's last column swamps everything.
      if (route.screen !== 'board' && route.screen !== 'list') return false;
    }
    if (assignee === 'me' && !t.assignees.includes(me)) return false;
    if (assignee === 'none' && t.assignees.length > 0) return false;
    if (assignee && assignee !== 'me' && assignee !== 'none' && !t.assignees.includes(assignee))
      return false;
    if (client && t.client !== client) return false;
    if (project && String(t.milestone?.number ?? '') !== project) return false;
    if (priority && t.priority !== priority) return false;
    if (status && t.status !== status) return false;
    if (needle) {
      const haystack = `#${t.number} ${t.title} ${t.body} ${t.client ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}
