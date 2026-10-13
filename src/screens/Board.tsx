/**
 * Kanban board. Four columns, drag a card from one to another to change its status.
 *
 * Moving a card to "Done" closes the issue on GitHub; dragging it back out reopens it.
 * That happens in the store, not here — this screen only reports the drop.
 */
import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { STATUSES, STATUS_TITLES } from '../lib/labels';
import type { Route } from '../lib/router';
import { useWorkspace } from '../state/store';
import { Filters, filterTasks } from '../components/Filters';
import { STATUS_VAR, TaskCard } from '../components/bits';
import type { Status, Task } from '../lib/types';

export function Board({
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
  const { tasks, me, moveTask } = useWorkspace();
  const [dragging, setDragging] = useState<Task | null>(null);

  // A small distance before a drag starts, so a click still opens the task.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const visible = useMemo(
    () => filterTasks(tasks, route, me, search, { includeDone: true }),
    [tasks, route, me, search],
  );

  const columns = useMemo(() => {
    const map = new Map<Status, Task[]>(STATUSES.map((s) => [s, []]));
    for (const task of visible) map.get(task.status)?.push(task);
    for (const list of map.values()) {
      list.sort((a, b) => {
        // Urgent first, then by due date, then newest.
        const rank = { urgent: 0, high: 1, normal: 2, low: 3 } as Record<string, number>;
        const pa = rank[a.priority ?? 'normal'] ?? 2;
        const pb = rank[b.priority ?? 'normal'] ?? 2;
        if (pa !== pb) return pa - pb;
        const da = a.meta.due ?? '9999';
        const db = b.meta.due ?? '9999';
        if (da !== db) return da.localeCompare(db);
        return b.updatedAt.localeCompare(a.updatedAt);
      });
    }
    return map;
  }, [visible]);

  function onDragStart(event: DragStartEvent) {
    setDragging(tasks.find((t) => t.number === Number(event.active.id)) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const over = event.over?.id;
    if (!over) return;
    void moveTask(Number(event.active.id), over as Status);
  }

  return (
    <div>
      <Filters route={route} />
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="board">
          {STATUSES.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={columns.get(status) ?? []}
              onOpen={onOpen}
              now={now}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging ? (
            <div
              className="card glass-solid"
              style={{ borderLeft: `3px solid ${STATUS_VAR[dragging.status]}`, cursor: 'grabbing' }}
            >
              <div className="card-title">{dragging.title}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  status,
  tasks,
  onOpen,
  now,
}: {
  status: Status;
  tasks: Task[];
  onOpen: (n: number) => void;
  now: Date;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} className={`glass column${isOver ? ' over' : ''}`}>
      <header className="column-head">
        <span className="dot" style={{ background: STATUS_VAR[status] }} />
        {STATUS_TITLES[status]}
        <span className="column-count">{tasks.length}</span>
      </header>
      {tasks.map((task) => (
        <DraggableCard key={task.number} task={task} onOpen={onOpen} now={now} />
      ))}
      {tasks.length === 0 ? <p className="faint" style={{ margin: '4px 2px' }}>Drop a task here</p> : null}
    </section>
  );
}

function DraggableCard({ task, onOpen, now }: { task: Task; onOpen: (n: number) => void; now: Date }) {
  const { members } = useWorkspace();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.number });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={isDragging ? 'dragging' : undefined}>
      <TaskCard task={task} members={members} now={now} onOpen={onOpen} />
    </div>
  );
}
