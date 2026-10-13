/**
 * "My Work" — the answer to "what do I do now".
 *
 * Nothing on this screen is clever: it is the five questions you actually ask
 * yourself in the morning, in the order you ask them.
 */
import { useMemo } from 'react';
import { groupForHome } from '../lib/dates';
import { useWorkspace } from '../state/store';
import { Ago, Empty, TaskCard, Avatar } from '../components/bits';
import type { Task } from '../lib/types';

export function Home({ onOpen, now }: { onOpen: (n: number) => void; now: Date }) {
  const { tasks, me, members, lastOpenedAt, loading } = useWorkspace();

  const buckets = useMemo(() => groupForHome(tasks, me, now), [tasks, me, now]);

  // "What changed since you last opened the app": anything touched after that moment,
  // by someone other than me.
  const changed = useMemo(() => {
    if (!lastOpenedAt) return [];
    return tasks
      .filter((t) => t.updatedAt > lastOpenedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 8);
  }, [tasks, lastOpenedAt]);

  const total =
    buckets.overdue.length +
    buckets.dueToday.length +
    buckets.dueThisWeek.length +
    buckets.waitingOnMyReview.length +
    buckets.unassigned.length;

  if (loading && tasks.length === 0) {
    return <div className="glass section">Loading your tasks…</div>;
  }

  return (
    <div>
      {total === 0 ? (
        <div className="glass section">
          <h2>Nothing needs you right now</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            No overdue tasks, nothing due this week, nothing waiting on your review.
          </p>
        </div>
      ) : null}

      <Section title="Overdue" tasks={buckets.overdue} tone="var(--danger)" onOpen={onOpen} now={now} />
      <Section title="Due today" tasks={buckets.dueToday} onOpen={onOpen} now={now} />
      <Section title="Due this week" tasks={buckets.dueThisWeek} onOpen={onOpen} now={now} />
      <Section
        title="Waiting on your review"
        tasks={buckets.waitingOnMyReview}
        onOpen={onOpen}
        now={now}
        hint="In review and not assigned to you"
      />
      <Section
        title="Nobody has picked these up"
        tasks={buckets.unassigned}
        onOpen={onOpen}
        now={now}
      />

      <div className="glass section">
        <h2>
          Since you last opened Board{' '}
          {lastOpenedAt ? (
            <span className="faint" style={{ fontWeight: 400 }}>
              (<Ago at={lastOpenedAt} />)
            </span>
          ) : null}
        </h2>
        {changed.length === 0 ? (
          <Empty>Nothing has changed.</Empty>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 7 }}>
            {changed.map((task) => (
              <li key={task.number}>
                <button className="card" onClick={() => onOpen(task.number)}>
                  <div className="row">
                    {task.assignees[0] ? (
                      <Avatar login={task.assignees[0]} members={members} size={20} />
                    ) : null}
                    <span className="truncate" style={{ flex: 1 }}>
                      <strong>#{task.number}</strong> {task.title}
                    </span>
                    <span className="faint">
                      <Ago at={task.updatedAt} />
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  tasks,
  tone,
  hint,
  onOpen,
  now,
}: {
  title: string;
  tasks: Task[];
  tone?: string;
  hint?: string;
  onOpen: (n: number) => void;
  now: Date;
}) {
  const { members } = useWorkspace();
  if (tasks.length === 0) return null;
  return (
    <section className="glass section">
      <h2 style={tone ? { color: tone } : undefined}>
        {title} <span className="faint">({tasks.length})</span>
        {hint ? (
          <span className="faint" style={{ fontWeight: 400, marginLeft: 8 }}>
            {hint}
          </span>
        ) : null}
      </h2>
      <div style={{ display: 'grid', gap: 7 }}>
        {tasks.map((task) => (
          <TaskCard key={task.number} task={task} members={members} now={now} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
