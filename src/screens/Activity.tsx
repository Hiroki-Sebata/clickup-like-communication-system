/** A plain timeline of what has happened in the repository lately. */
import { useWorkspace } from '../state/store';
import { Ago, Empty } from '../components/bits';

const VERBS: Record<string, string> = {
  closed: 'finished',
  reopened: 'reopened',
  assigned: 'assigned',
  unassigned: 'unassigned',
  labeled: 'changed',
  milestoned: 'moved to project',
  commented: 'commented on',
};

export function Activity({ onOpen }: { onOpen: (n: number) => void }) {
  const { activity, tasks } = useWorkspace();

  if (activity.length === 0) {
    return (
      <div className="glass section">
        <Empty>Nothing yet. Activity appears here as soon as either of you touches a task.</Empty>
      </div>
    );
  }

  return (
    <div className="glass section">
      <h2>Recent activity</h2>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
        {activity.map((item) => {
          const task = tasks.find((t) => t.number === item.issueNumber);
          const title = item.issueTitle || task?.title || `#${item.issueNumber}`;
          return (
            <li key={item.id}>
              <button
                className="btn btn-ghost"
                style={{ width: '100%', justifyContent: 'flex-start', padding: '8px 9px', textAlign: 'left' }}
                onClick={() => onOpen(item.issueNumber)}
              >
                {item.avatarUrl ? (
                  <img className="avatar" src={item.avatarUrl} alt="" width={20} height={20} />
                ) : null}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong>{item.actor}</strong> {VERBS[item.verb] ?? item.verb}{' '}
                  <span className="muted">#{item.issueNumber}</span> {title}
                  {item.detail && item.kind === 'event' ? (
                    <span className="chip" style={{ marginLeft: 6 }}>{item.detail}</span>
                  ) : null}
                  {item.detail && item.kind === 'comment' ? (
                    <span className="faint" style={{ display: 'block' }}>
                      {item.detail.length > 150 ? `${item.detail.slice(0, 150)}…` : item.detail}
                    </span>
                  ) : null}
                </span>
                <span className="faint"><Ago at={item.at} /></span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
