/** Small pieces used on more than one screen. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderMarkdown } from '../lib/markdown';
import { STATUS_TITLES } from '../lib/labels';
import { describeDue } from '../lib/dates';
import type { Member, Priority, Status, Task } from '../lib/types';

export const STATUS_VAR: Record<Status, string> = {
  todo: 'var(--status-todo)',
  'in progress': 'var(--status-progress)',
  review: 'var(--status-review)',
  done: 'var(--status-done)',
};

export const PRIORITY_VAR: Record<Priority, string> = {
  urgent: 'var(--priority-urgent)',
  high: 'var(--priority-high)',
  normal: 'var(--priority-normal)',
  low: 'var(--priority-low)',
};

export function StatusChip({ status }: { status: Status }) {
  return (
    <span className="chip" style={{ color: STATUS_VAR[status] }}>
      <span className="dot" style={{ background: STATUS_VAR[status] }} />
      {STATUS_TITLES[status]}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: Priority | null }) {
  if (!priority) return null;
  return (
    <span className="chip" style={{ color: PRIORITY_VAR[priority] }}>
      {priority}
    </span>
  );
}

export function ClientChip({ client }: { client: string | null }) {
  if (!client) return null;
  return <span className="chip">{client}</span>;
}

export function DueChip({ due, now }: { due?: string; now: Date }) {
  if (!due) return null;
  const overdue = due < now.toISOString().slice(0, 10) && due < localToday(now);
  return (
    <span className="chip" style={overdue ? { color: 'var(--danger)' } : undefined}>
      {describeDue(due, now)}
    </span>
  );
}

function localToday(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function Avatar({ login, members, size = 22 }: { login: string; members: Member[]; size?: number }) {
  const member = members.find((m) => m.login === login);
  const src = member?.avatarUrl ?? `https://avatars.githubusercontent.com/${login}`;
  return (
    <img
      className="avatar"
      src={src}
      alt={login}
      title={login}
      width={size}
      height={size}
      loading="lazy"
    />
  );
}

export function Avatars({ logins, members }: { logins: string[]; members: Member[] }) {
  if (logins.length === 0) return <span className="faint">unassigned</span>;
  return (
    <span className="row" style={{ gap: 3 }}>
      {logins.map((l) => (
        <Avatar key={l} login={l} members={members} size={20} />
      ))}
    </span>
  );
}

/**
 * The ONLY component allowed to set HTML directly. Everything it is given has been
 * through DOMPurify in renderMarkdown, and @mentions are highlighted afterwards by
 * walking the DOM, never by string-patching the HTML.
 */
export function Markdown({ source, members }: { source: string; members: Member[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const html = useMemo(() => renderMarkdown(source), [source]);
  const logins = useMemo(() => members.map((m) => m.login), [members]);

  useEffect(() => {
    const root = ref.current;
    if (!root || logins.length === 0) return;
    // Walk text nodes and wrap "@someone" in a span. Working on text nodes rather
    // than on the HTML string means we can never accidentally inject a tag.
    const pattern = new RegExp(`@(${logins.map(escapeRegex).join('|')})\\b`, 'g');
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const targets: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.parentElement?.closest('code, pre, a')) continue;
      if (pattern.test(node.data)) targets.push(node);
      pattern.lastIndex = 0;
    }
    for (const node of targets) {
      const fragment = document.createDocumentFragment();
      let last = 0;
      for (const match of node.data.matchAll(pattern)) {
        const index = match.index ?? 0;
        if (index > last) fragment.append(node.data.slice(last, index));
        const span = document.createElement('span');
        span.className = 'mention';
        span.textContent = match[0];
        fragment.append(span);
        last = index + match[0].length;
      }
      if (last < node.data.length) fragment.append(node.data.slice(last));
      node.replaceWith(fragment);
    }
  }, [html, logins]);

  return <div className="md" ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Relative time, e.g. "3 minutes ago". */
export function Ago({ at }: { at: string }) {
  const [, force] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => force((n) => n + 1), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return <span title={new Date(at).toLocaleString()}>{formatAgo(at)}</span>;
}

export function formatAgo(at: string): string {
  const seconds = Math.round((Date.now() - new Date(at).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Date(at).toLocaleDateString();
}

/** The little coloured bar on the left of a task card. */
export function TaskCard({
  task,
  members,
  now,
  onOpen,
}: {
  task: Task;
  members: Member[];
  now: Date;
  onOpen: (n: number) => void;
}) {
  return (
    <button
      className="card"
      style={{ borderLeft: `3px solid ${STATUS_VAR[task.status]}` }}
      onClick={() => onOpen(task.number)}
    >
      <div className="card-title">{task.title}</div>
      <div className="card-meta">
        <span className="faint">#{task.number}</span>
        <PriorityChip priority={task.priority} />
        <ClientChip client={task.client} />
        <DueChip due={task.meta.due} now={now} />
        {task.meta.estimate ? <span className="chip">{task.meta.estimate}</span> : null}
        <span className="spacer" />
        <Avatars logins={task.assignees} members={members} />
      </div>
    </button>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
