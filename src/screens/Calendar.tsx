/**
 * Month and week views, by due date. Drag a task onto another day to move its
 * deadline — that rewrites the hidden metadata block in the issue body.
 */
import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { toISODate } from '../lib/dates';
import type { Route } from '../lib/router';
import { useWorkspace } from '../state/store';
import { Filters, filterTasks } from '../components/Filters';
import { STATUS_VAR } from '../components/bits';
import type { Task } from '../lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function Calendar({
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
  const { tasks, me, setDue } = useWorkspace();
  const [view, setView] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const visible = useMemo(
    () => filterTasks(tasks, route, me, search, { includeDone: true }),
    [tasks, route, me, search],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of visible) {
      if (!t.meta.due) continue;
      const list = map.get(t.meta.due) ?? [];
      list.push(t);
      map.set(t.meta.due, list);
    }
    return map;
  }, [visible]);

  const days = useMemo(() => (view === 'month' ? monthGrid(anchor) : weekGrid(anchor)), [view, anchor]);

  function shift(direction: -1 | 1) {
    setAnchor((d) =>
      view === 'month'
        ? new Date(d.getFullYear(), d.getMonth() + direction, 1)
        : new Date(d.getFullYear(), d.getMonth(), d.getDate() + direction * 7),
    );
  }

  function onDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    void setDue(Number(event.active.id), String(event.over.id));
  }

  const today = toISODate(now);
  const withoutDue = visible.filter((t) => !t.meta.due && t.status !== 'done');

  return (
    <div>
      <Filters route={route} />
      <div className="glass" style={{ padding: 13 }}>
        <div className="row" style={{ marginBottom: 11 }}>
          <button className="btn btn-sm" onClick={() => shift(-1)} aria-label="Previous">←</button>
          <strong style={{ minWidth: 160, textAlign: 'center' }}>
            {view === 'month'
              ? anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
              : `Week of ${weekGrid(anchor)[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
          </strong>
          <button className="btn btn-sm" onClick={() => shift(1)} aria-label="Next">→</button>
          <button className="btn btn-sm" onClick={() => setAnchor(new Date(now.getFullYear(), now.getMonth(), now.getDate()))}>
            Today
          </button>
          <span className="spacer" />
          <button className={`btn btn-sm${view === 'month' ? ' btn-primary' : ''}`} onClick={() => setView('month')}>
            Month
          </button>
          <button className={`btn btn-sm${view === 'week' ? ' btn-primary' : ''}`} onClick={() => setView('week')}>
            Week
          </button>
        </div>

        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <div className="calendar">
            {WEEKDAYS.map((d) => (
              <div key={d} className="cal-head">{d}</div>
            ))}
            {days.map((date) => {
              const iso = toISODate(date);
              return (
                <Day
                  key={iso}
                  iso={iso}
                  date={date}
                  tasks={byDay.get(iso) ?? []}
                  isToday={iso === today}
                  outside={view === 'month' && date.getMonth() !== anchor.getMonth()}
                  tall={view === 'week'}
                  onOpen={onOpen}
                />
              );
            })}
          </div>
        </DndContext>
      </div>

      {withoutDue.length > 0 ? (
        <div className="glass section" style={{ marginTop: 12 }}>
          <h2>No due date ({withoutDue.length})</h2>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {withoutDue.map((t) => (
              <button key={t.number} className="chip" onClick={() => onOpen(t.number)} style={{ cursor: 'pointer' }}>
                #{t.number} {t.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Day({
  iso,
  date,
  tasks,
  isToday,
  outside,
  tall,
  onOpen,
}: {
  iso: string;
  date: Date;
  tasks: Task[];
  isToday: boolean;
  outside: boolean;
  tall: boolean;
  onOpen: (n: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: iso });
  return (
    <div
      ref={setNodeRef}
      className={`cal-day${isToday ? ' today' : ''}${outside ? ' outside' : ''}${isOver ? ' over' : ''}`}
      style={tall ? { minHeight: 230 } : undefined}
    >
      <div className="cal-date">{date.getDate()}</div>
      {tasks.map((t) => (
        <DraggableTask key={t.number} task={t} onOpen={onOpen} />
      ))}
    </div>
  );
}

function DraggableTask({ task, onOpen }: { task: Task; onOpen: (n: number) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.number });
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`cal-task${isDragging ? ' dragging' : ''}`}
      style={{ borderLeftColor: STATUS_VAR[task.status] }}
      onClick={() => onOpen(task.number)}
      title={task.title}
    >
      {task.title}
    </button>
  );
}

/**
 * Whole weeks starting on the Monday on or before the 1st, stopping at the week
 * that holds the last day of the month. Most months need five rows, not six, and
 * an empty trailing row just wastes a third of the screen.
 */
function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const span = Math.round((last.getTime() - start.getTime()) / 86_400_000) + 1;
  const weeks = Math.ceil(span / 7);
  return Array.from(
    { length: weeks * 7 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
}

/** The Monday-to-Sunday week containing the anchor. */
function weekGrid(anchor: Date): Date[] {
  const offset = (anchor.getDay() + 6) % 7;
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}
