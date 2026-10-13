/**
 * Projects are GitHub milestones. The progress bar is simply closed vs total,
 * which is the same number GitHub shows, so the two never disagree.
 */
import { useMemo, useState } from 'react';
import { describeDue } from '../lib/dates';
import { useWorkspace } from '../state/store';
import { Empty, StatusChip } from '../components/bits';
import { go } from '../lib/router';

export function Projects({ onOpen, now }: { onOpen: (n: number) => void; now: Date }) {
  const { projects, tasks, createProject } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [description, setDescription] = useState('');

  const sorted = useMemo(
    () =>
      [...projects].sort((a, b) => {
        if (a.state !== b.state) return a.state === 'open' ? -1 : 1;
        return (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999');
      }),
    [projects],
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    await createProject(title.trim(), due || null, description.trim());
    setTitle('');
    setDue('');
    setDescription('');
    setAdding(false);
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 11 }}>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => setAdding((a) => !a)}>
          {adding ? 'Cancel' : '+ New project'}
        </button>
      </div>

      {adding ? (
        <form className="glass section" onSubmit={submit}>
          <div className="panel-grid">
            <div>
              <label htmlFor="pt">Name</label>
              <input id="pt" type="text" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div>
              <label htmlFor="pd">Due date</label>
              <input id="pd" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label htmlFor="pdesc">Description</label>
            <input id="pdesc" type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <button className="btn btn-primary" style={{ marginTop: 11 }} type="submit" disabled={!title.trim()}>
            Create project
          </button>
        </form>
      ) : null}

      {sorted.length === 0 ? (
        <div className="glass section">
          <Empty>
            No projects yet. A project is a GitHub milestone — make one above, then put
            tasks in it from the task panel.
          </Empty>
        </div>
      ) : null}

      {sorted.map((project) => {
        const total = project.openIssues + project.closedIssues;
        const percent = total === 0 ? 0 : Math.round((project.closedIssues / total) * 100);
        const inProject = tasks.filter((t) => t.milestone?.number === project.number);
        const overdue = project.dueOn && project.dueOn < new Date().toISOString().slice(0, 10) && project.openIssues > 0;

        return (
          <section className="glass section" key={project.number}>
            <div className="row" style={{ alignItems: 'baseline' }}>
              <h2 style={{ margin: 0 }}>{project.title}</h2>
              {project.state === 'closed' ? <span className="chip">closed</span> : null}
              <span className="spacer" />
              {project.dueOn ? (
                <span className="chip" style={overdue ? { color: 'var(--danger)' } : undefined}>
                  due {describeDue(project.dueOn, now)}
                </span>
              ) : (
                <span className="faint">no due date</span>
              )}
            </div>

            {project.description ? <p className="muted" style={{ margin: '7px 0' }}>{project.description}</p> : null}

            <div className="row" style={{ margin: '10px 0 7px' }}>
              <div className="progress" style={{ flex: 1 }}>
                <div style={{ width: `${percent}%` }} />
              </div>
              <span className="faint" style={{ minWidth: 118, textAlign: 'right' }}>
                {project.closedIssues} of {total} done ({percent}%)
              </span>
            </div>

            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {inProject.slice(0, 12).map((t) => (
                <button key={t.number} className="chip" style={{ cursor: 'pointer' }} onClick={() => onOpen(t.number)}>
                  <StatusChip status={t.status} />
                  <span className="truncate" style={{ maxWidth: 190 }}>{t.title}</span>
                </button>
              ))}
              {inProject.length > 12 ? (
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => go('list', new URLSearchParams({ project: String(project.number) }))}
                >
                  see all {inProject.length}
                </button>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
