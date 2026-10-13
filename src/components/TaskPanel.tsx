/**
 * The task detail side panel: every field editable, and the comment thread
 * underneath as the running update log.
 *
 * Edits are collected locally and saved with the Save button, so the conflict check
 * has one clear "this is what I started from" point. The status buttons save at once,
 * because that is what you expect when you click a status.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PRIORITIES, STATUSES, STATUS_TITLES } from '../lib/labels';
import { isValidDue } from '../lib/metadata';
import type { Resolution, FieldConflict } from '../lib/conflict';
import { useWorkspace, type TaskPatch } from '../state/store';
import { Ago, Avatar, Markdown, StatusChip, STATUS_VAR } from './bits';
import { ConflictDialog } from './ConflictDialog';
import type { Comment, Status, Task } from '../lib/types';

export function TaskPanel({ task, onClose }: { task: Task; onClose: () => void }) {
  const { api, members, projects, clients, me, saveTask, addComment, notify } = useWorkspace();

  // The version this edit started from. Frozen until the task is saved or reopened,
  // because it is what the conflict check compares against.
  const [base, setBase] = useState<Task>(task);
  const [draft, setDraft] = useState(() => toDraft(task));
  const [saving, setSaving] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [conflicts, setConflicts] = useState<FieldConflict[] | null>(null);
  const pendingPatch = useRef<TaskPatch | null>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);

  // Opening a different task resets everything.
  useEffect(() => {
    setBase(task);
    setDraft(toDraft(task));
    setConflicts(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.number]);

  useEffect(() => {
    let cancelled = false;
    void api.listComments(task.number).then((list) => {
      if (!cancelled) setComments(list);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, task.number, task.comments]);

  const dirty = useMemo(() => buildPatch(base, draft), [base, draft]);
  const hasChanges = Object.keys(dirty).length > 0;

  async function save(choices?: Record<string, Resolution>) {
    const patch = choices ? pendingPatch.current : dirty;
    if (!patch || Object.keys(patch).length === 0) return;
    if (patch.due && !isValidDue(patch.due)) {
      notify('That due date is not a real date.', 'error');
      return;
    }
    setSaving(true);
    const result = await saveTask(task.number, patch, base, choices);
    setSaving(false);
    if (result.conflicts) {
      pendingPatch.current = patch;
      setConflicts(result.conflicts);
      if (result.latest) {
        setBase(result.latest);
      }
      return;
    }
    if (result.ok) {
      setConflicts(null);
      pendingPatch.current = null;
      notify('Saved', 'success');
    }
  }

  /** Status buttons save immediately — clicking a status means doing it. */
  async function setStatus(next: Status) {
    if (next === base.status) return;
    setDraft((d) => ({ ...d, status: next }));
    setSaving(true);
    const result = await saveTask(task.number, { status: next }, base);
    setSaving(false);
    if (result.conflicts) {
      pendingPatch.current = { status: next };
      setConflicts(result.conflicts);
      if (result.latest) setBase(result.latest);
    }
  }

  async function postComment() {
    const body = commentDraft.trim();
    if (!body) return;
    setPosting(true);
    const ok = await addComment(task.number, body);
    setPosting(false);
    if (ok) {
      setCommentDraft('');
      setComments(await api.listComments(task.number).catch(() => comments));
    }
  }

  /** Insert "@login " at the cursor. */
  function mention(login: string) {
    const area = commentRef.current;
    const at = area?.selectionStart ?? commentDraft.length;
    setCommentDraft((c) => `${c.slice(0, at)}@${login} ${c.slice(at)}`);
    window.setTimeout(() => area?.focus(), 0);
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="glass-solid panel" role="dialog" aria-modal="true" aria-label={task.title}>
        <header className="panel-head">
          <span className="dot" style={{ background: STATUS_VAR[draft.status as Status], marginTop: 8 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              type="text"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              aria-label="Title"
              style={{ fontWeight: 650, fontSize: 15, border: 'none', background: 'transparent', padding: '2px 0' }}
            />
            <div className="faint">
              #{task.number} · opened by {task.author} · updated <Ago at={task.updatedAt} />
              {task.htmlUrl && task.htmlUrl !== '#' ? (
                <>
                  {' · '}
                  <a href={task.htmlUrl} target="_blank" rel="noreferrer noopener">
                    on GitHub
                  </a>
                </>
              ) : null}
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close (Esc)">
            ✕
          </button>
        </header>

        <div className="panel-body">
          {/* status buttons */}
          <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {STATUSES.map((s) => (
              <button
                key={s}
                className={`btn btn-sm${draft.status === s ? ' btn-primary' : ''}`}
                onClick={() => setStatus(s)}
                disabled={saving}
              >
                {STATUS_TITLES[s]}
              </button>
            ))}
            {draft.status === 'done' ? (
              <span className="faint">The issue is closed on GitHub.</span>
            ) : null}
          </div>

          <div className="panel-grid">
            <Field label="Priority">
              <select
                value={draft.priority}
                onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))}
              >
                <option value="">none</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </Field>

            <Field label="Client">
              <input
                type="text"
                list="board-clients"
                value={draft.client}
                placeholder="e.g. Acme Dental"
                onChange={(e) => setDraft((d) => ({ ...d, client: e.target.value }))}
              />
              <datalist id="board-clients">
                {clients.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>

            <Field label="Project">
              <select
                value={draft.milestone}
                onChange={(e) => setDraft((d) => ({ ...d, milestone: e.target.value }))}
              >
                <option value="">none</option>
                {projects.map((p) => (
                  <option key={p.number} value={p.title}>{p.title}</option>
                ))}
              </select>
            </Field>

            <Field label="Due date">
              <input
                type="date"
                value={draft.due}
                onChange={(e) => setDraft((d) => ({ ...d, due: e.target.value }))}
              />
            </Field>

            <Field label="Time estimate">
              <input
                type="text"
                value={draft.estimate}
                placeholder="2h, 3d, 45m…"
                onChange={(e) => setDraft((d) => ({ ...d, estimate: e.target.value }))}
              />
            </Field>

            <Field label="Assignees">
              <div className="row" style={{ flexWrap: 'wrap', gap: 5 }}>
                {members.map((m) => {
                  const on = draft.assignees.includes(m.login);
                  return (
                    <button
                      key={m.login}
                      className={`btn btn-sm${on ? ' btn-primary' : ''}`}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          assignees: on
                            ? d.assignees.filter((a) => a !== m.login)
                            : [...d.assignees, m.login],
                        }))
                      }
                    >
                      <Avatar login={m.login} members={members} size={16} />
                      {m.login === me ? 'me' : m.login}
                    </button>
                  );
                })}
                {members.length === 0 ? <span className="faint">no members found</span> : null}
              </div>
            </Field>
          </div>

          <Field label="Description (Markdown)">
            <textarea
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              rows={7}
            />
            {draft.body ? (
              <details style={{ marginTop: 7 }}>
                <summary className="faint" style={{ cursor: 'pointer' }}>Preview</summary>
                <div style={{ marginTop: 7 }}>
                  <Markdown source={draft.body} members={members} />
                </div>
              </details>
            ) : null}
          </Field>

          <div className="row">
            <button className="btn btn-primary" onClick={() => save()} disabled={!hasChanges || saving}>
              {saving ? 'Saving…' : hasChanges ? `Save ${Object.keys(dirty).length} change${Object.keys(dirty).length > 1 ? 's' : ''}` : 'Saved'}
            </button>
            {hasChanges ? (
              <button className="btn" onClick={() => setDraft(toDraft(base))} disabled={saving}>
                Discard
              </button>
            ) : null}
          </div>

          {/* --- comments --- */}
          <section>
            <h2 style={{ fontSize: 13, margin: '4px 0 9px' }}>
              Updates <span className="faint">({comments.length})</span>
            </h2>

            <div style={{ display: 'grid', gap: 9, marginBottom: 11 }}>
              {comments.map((c) => (
                <article
                  key={c.id}
                  className="card"
                  style={{ cursor: 'default' }}
                  onClick={(e) => e.preventDefault()}
                >
                  <div className="row" style={{ marginBottom: 5 }}>
                    <img className="avatar" src={c.avatarUrl} alt="" width={20} height={20} />
                    <strong>{c.author}</strong>
                    <span className="spacer" />
                    <span className="faint"><Ago at={c.createdAt} /></span>
                  </div>
                  <Markdown source={c.body} members={members} />
                </article>
              ))}
              {comments.length === 0 ? <p className="faint">No updates yet.</p> : null}
            </div>

            <textarea
              ref={commentRef}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder="Write an update…  Ctrl/Cmd + Enter to post"
              rows={3}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void postComment();
              }}
            />
            <div className="row" style={{ marginTop: 7 }}>
              <span className="faint">Mention:</span>
              {members.map((m) => (
                <button key={m.login} className="btn btn-sm btn-ghost" onClick={() => mention(m.login)}>
                  @{m.login}
                </button>
              ))}
              <span className="spacer" />
              <button className="btn btn-primary btn-sm" onClick={postComment} disabled={!commentDraft.trim() || posting}>
                {posting ? 'Posting…' : 'Post update'}
              </button>
            </div>
          </section>
        </div>
      </aside>

      {conflicts ? (
        <ConflictDialog
          conflicts={conflicts}
          theirAuthor={base.author}
          onCancel={() => {
            setConflicts(null);
            pendingPatch.current = null;
            setDraft(toDraft(base));
          }}
          onResolve={(choices) => {
            setConflicts(null);
            void save(choices);
          }}
        />
      ) : null}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label>{label}</label>
      {children}
    </div>
  );
}

interface Draft {
  title: string;
  body: string;
  status: string;
  priority: string;
  client: string;
  milestone: string;
  due: string;
  estimate: string;
  assignees: string[];
}

function toDraft(task: Task): Draft {
  return {
    title: task.title,
    body: task.body,
    status: task.status,
    priority: task.priority ?? '',
    client: task.client ?? '',
    milestone: task.milestone?.title ?? '',
    due: task.meta.due ?? '',
    estimate: task.meta.estimate ?? '',
    assignees: [...task.assignees],
  };
}

/** Only the fields that actually differ from the version we started with. */
function buildPatch(base: Task, draft: Draft): TaskPatch {
  const patch: TaskPatch = {};
  if (draft.title !== base.title) patch.title = draft.title;
  if (draft.body !== base.body) patch.body = draft.body;
  if (draft.status !== base.status) patch.status = draft.status;
  if (draft.priority !== (base.priority ?? '')) patch.priority = draft.priority;
  if (draft.client !== (base.client ?? '')) patch.client = draft.client;
  if (draft.milestone !== (base.milestone?.title ?? '')) patch.milestone = draft.milestone;
  if (draft.due !== (base.meta.due ?? '')) patch.due = draft.due;
  if (draft.estimate !== (base.meta.estimate ?? '')) patch.estimate = draft.estimate;
  const sorted = [...draft.assignees].sort().join(', ');
  if (sorted !== [...base.assignees].sort().join(', ')) patch.assignees = sorted;
  return patch;
}

export { StatusChip };
