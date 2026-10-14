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
  const { projects, tasks, createProject, updateProject, deleteProject } = useWorkspace();
  const [adding, setAdding] = useState(false);
  // Which project is being edited, and the values being typed into it.
  const [editing, setEditing] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDue, setEditDue] = useState('');
  const [editDesc, setEditDesc] = useState('');
  // Delete needs a second click; the first one only arms it.
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
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
        const inProject = tasks.filter((t) => t.milestone?.number === project.number);
        const total = project.openIssues + project.closedIssues;
        const percent = total === 0 ? 0 : Math.round((project.closedIssues / total) * 100);
        const overdue = project.dueOn && project.dueOn < new Date().toISOString().slice(0, 10) && project.openIssues > 0;

        return (
          <section className="glass section" key={project.number}>
            <div className="row" style={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
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
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setConfirmDelete(null);
                  if (editing === project.number) {
                    setEditing(null);
                    return;
                  }
                  setEditing(project.number);
                  setEditTitle(project.title);
                  setEditDue(project.dueOn ?? '');
                  setEditDesc(project.description ?? '');
                }}
              >
                {editing === project.number ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {editing === project.number ? (
              <div
                style={{
                  border: '1px solid var(--border-soft)',
                  borderRadius: 'var(--radius-button)',
                  padding: 12,
                  margin: '10px 0',
                }}
              >
                <div className="panel-grid">
                  <div>
                    <label htmlFor={`t${project.number}`}>Name</label>
                    <input
                      id={`t${project.number}`}
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor={`d${project.number}`}>Deadline</label>
                    <input
                      id={`d${project.number}`}
                      type="date"
                      value={editDue}
                      onChange={(e) => setEditDue(e.target.value)}
                    />
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <label htmlFor={`x${project.number}`}>Description</label>
                  <input
                    id={`x${project.number}`}
                    type="text"
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                  />
                </div>

                <div className="row" style={{ marginTop: 11, flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!editTitle.trim()}
                    onClick={async () => {
                      await updateProject(project.number, {
                        title: editTitle.trim(),
                        dueOn: editDue || null,
                        description: editDesc.trim(),
                      });
                      setEditing(null);
                    }}
                  >
                    Save changes
                  </button>

                  <button
                    className="btn btn-sm"
                    onClick={() =>
                      updateProject(project.number, {
                        state: project.state === 'open' ? 'closed' : 'open',
                      })
                    }
                  >
                    {project.state === 'open' ? 'Close project' : 'Reopen project'}
                  </button>

                  <span className="spacer" />

                  {confirmDelete === project.number ? (
                    <>
                      <span className="faint">
                        Delete it? The {inProject.length} task
                        {inProject.length === 1 ? '' : 's'} inside will be kept.
                      </span>
                      <button
                        className="btn btn-sm"
                        style={{ color: 'var(--danger)', borderColor: 'currentColor' }}
                        onClick={async () => {
                          await deleteProject(project.number);
                          setConfirmDelete(null);
                          setEditing(null);
                        }}
                      >
                        Yes, delete
                      </button>
                      <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>
                        Keep it
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-sm btn-ghost"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => setConfirmDelete(project.number)}
                    >
                      Delete project
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            {project.description && editing !== project.number ? (
              <p className="muted" style={{ margin: '7px 0' }}>{project.description}</p>
            ) : null}

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
