/** The "+ New task" dialog, also opened with the N key. */
import { useState } from 'react';
import { PRIORITIES, STATUSES, STATUS_TITLES } from '../lib/labels';
import { useWorkspace } from '../state/store';
import { Avatar } from './bits';
import type { Status } from '../lib/types';

export function NewTask({ onClose, onCreated }: { onClose: () => void; onCreated: (n: number) => void }) {
  const { members, projects, clients, me, createTask } = useWorkspace();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<Status>('todo');
  const [priority, setPriority] = useState('normal');
  const [client, setClient] = useState('');
  const [milestone, setMilestone] = useState('');
  const [due, setDue] = useState('');
  const [estimate, setEstimate] = useState('');
  const [assignees, setAssignees] = useState<string[]>([me]);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const task = await createTask({
      title: title.trim(),
      body: body.trim(),
      status,
      priority: priority || null,
      client: client.trim() || null,
      assignees,
      milestone: milestone ? Number(milestone) : null,
      due: due || null,
      estimate: estimate.trim() || null,
    });
    setBusy(false);
    if (task) {
      onClose();
      onCreated(task.number);
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <form className="glass-solid dialog" onSubmit={submit} role="dialog" aria-modal="true" aria-label="New task">
        <h2 style={{ marginTop: 0 }}>New task</h2>

        <label htmlFor="nt-title">Title</label>
        <input
          id="nt-title"
          type="text"
          value={title}
          autoFocus
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
        />

        <div style={{ marginTop: 11 }}>
          <label htmlFor="nt-body">Description (Markdown)</label>
          <textarea id="nt-body" value={body} rows={4} onChange={(e) => setBody(e.target.value)} />
        </div>

        <div className="panel-grid" style={{ marginTop: 11 }}>
          <div>
            <label htmlFor="nt-status">Status</label>
            <select id="nt-status" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_TITLES[s]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="nt-priority">Priority</label>
            <select id="nt-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="">none</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="nt-client">Client</label>
            <input id="nt-client" type="text" list="nt-clients" value={client} onChange={(e) => setClient(e.target.value)} />
            <datalist id="nt-clients">
              {clients.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label htmlFor="nt-project">Project</label>
            <select id="nt-project" value={milestone} onChange={(e) => setMilestone(e.target.value)}>
              <option value="">none</option>
              {projects.map((p) => (
                <option key={p.number} value={p.number}>{p.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="nt-due">Due date</label>
            <input id="nt-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div>
            <label htmlFor="nt-est">Time estimate</label>
            <input id="nt-est" type="text" value={estimate} placeholder="2h" onChange={(e) => setEstimate(e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: 11 }}>
          <label>Assignees</label>
          <div className="row" style={{ flexWrap: 'wrap', gap: 5 }}>
            {members.map((m) => {
              const on = assignees.includes(m.login);
              return (
                <button
                  type="button"
                  key={m.login}
                  className={`btn btn-sm${on ? ' btn-primary' : ''}`}
                  onClick={() =>
                    setAssignees((a) => (on ? a.filter((x) => x !== m.login) : [...a, m.login]))
                  }
                >
                  <Avatar login={m.login} members={members} size={16} />
                  {m.login === me ? 'me' : m.login}
                </button>
              );
            })}
          </div>
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!title.trim() || busy}>
            {busy ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </form>
    </>
  );
}
