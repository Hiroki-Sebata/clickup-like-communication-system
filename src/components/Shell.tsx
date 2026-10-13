/** The frame: left sidebar, top bar, status indicators, toasts. */
import { config } from '../config';
import { SCREENS, href, type Route, type ScreenName } from '../lib/router';
import { useWorkspace } from '../state/store';
import type { ThemeChoice } from '../state/theme';

const NAV: Array<{ screen: ScreenName; label: string; key: string; icon: string }> = [
  { screen: 'home', label: 'My Work', key: '1', icon: '◎' },
  { screen: 'board', label: 'Board', key: '2', icon: '▦' },
  { screen: 'list', label: 'List', key: '3', icon: '☰' },
  { screen: 'calendar', label: 'Calendar', key: '4', icon: '▤' },
  { screen: 'projects', label: 'Projects', key: '5', icon: '◫' },
  { screen: 'activity', label: 'Activity', key: '', icon: '◷' },
];

export function Sidebar({ route }: { route: Route }) {
  const { viewer, signOut, offline } = useWorkspace();

  return (
    <nav className="glass sidebar" aria-label="Screens">
      <div className="row" style={{ padding: '2px 6px 12px' }}>
        <span
          aria-hidden
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            background: 'linear-gradient(135deg,#4f6ff5,#8b5cf0)',
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            flex: 'none',
          }}
        >
          B
        </span>
        <strong className="nav-label">Board</strong>
      </div>

      {NAV.map((item) => (
        <a
          key={item.screen}
          className="nav-item"
          href={href(item.screen)}
          aria-current={route.screen === item.screen ? 'page' : undefined}
        >
          <span aria-hidden style={{ width: 16, textAlign: 'center' }}>
            {item.icon}
          </span>
          <span className="nav-label">{item.label}</span>
          {item.key ? <kbd className="nav-key">{item.key}</kbd> : null}
        </a>
      ))}

      <div className="spacer" />

      <div className="sidebar-section faint" style={{ padding: '10px 6px 6px', lineHeight: 1.6 }}>
        <div className="row">
          <img className="avatar" src={viewer.avatarUrl} alt="" width={22} height={22} />
          <span className="truncate">{viewer.name ?? viewer.login}</span>
        </div>
        <div style={{ marginTop: 4 }}>
          {config.dataOwner}/{config.dataRepo}
        </div>
        {offline ? <div style={{ color: 'var(--warning)' }}>Offline — showing saved copy</div> : null}
      </div>

      <button className="btn btn-sm nav-label" onClick={signOut} style={{ marginTop: 4 }}>
        Sign out and forget token
      </button>
    </nav>
  );
}

export function TopBar({
  route,
  search,
  onSearch,
  onNewTask,
  theme,
  onCycleTheme,
  searchRef,
}: {
  route: Route;
  search: string;
  onSearch: (value: string) => void;
  onNewTask: () => void;
  theme: ThemeChoice;
  onCycleTheme: () => void;
  searchRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <header className="glass topbar">
      <input
        ref={searchRef}
        type="search"
        placeholder="Search tasks…  ( / )"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        aria-label="Search tasks"
        style={{ maxWidth: 340 }}
      />
      <span className="faint hide-narrow" style={{ textTransform: 'capitalize' }}>
        {route.screen === 'home' ? 'My Work' : route.screen}
      </span>
      <span className="spacer" />
      <SyncStatus />
      <button
        className="btn btn-sm"
        onClick={onCycleTheme}
        title={`Theme: ${theme}. Click to change.`}
        aria-label={`Theme: ${theme}. Click to change.`}
      >
        <span style={{ fontSize: 14, lineHeight: 1 }} aria-hidden>
          {theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'Auto'}
        </span>
      </button>
      <button className="btn btn-primary btn-sm" onClick={onNewTask}>
        + New task <kbd className="nav-key hide-narrow">N</kbd>
      </button>
    </header>
  );
}

/** Rate limit, token expiry, back-off and offline, in one small strip. */
function SyncStatus() {
  const { rateLimit, backoffUntil, offline, lastSyncedAt, viewer, stats } = useWorkspace();

  const percent = rateLimit.limit ? Math.round((rateLimit.remaining / rateLimit.limit) * 100) : 100;
  const low = percent < 15;

  // Token expiry: warn when it is close.
  let expiryWarning: string | null = null;
  if (viewer.tokenExpiresAt) {
    const days = Math.ceil((viewer.tokenExpiresAt.getTime() - Date.now()) / 86_400_000);
    if (days <= 0) expiryWarning = 'Token expired';
    else if (days <= config.tokenExpiryWarningDays)
      expiryWarning = `Token expires in ${days} day${days === 1 ? '' : 's'}`;
  }

  return (
    <div className="statusbar hide-narrow">
      {offline ? <span className="pill warn">Offline</span> : null}
      {backoffUntil ? (
        <span className="pill warn" title="GitHub asked us to slow down">
          Waiting until {backoffUntil.toLocaleTimeString()}
        </span>
      ) : null}
      {expiryWarning ? (
        <span className="pill bad" title="Make a new token in GitHub settings">
          {expiryWarning}
        </span>
      ) : null}
      <span
        className={`pill${low ? ' warn' : ''}`}
        title={`${rateLimit.remaining} of ${rateLimit.limit} API requests left this hour.${
          rateLimit.resetAt ? ` Refills at ${rateLimit.resetAt.toLocaleTimeString()}.` : ''
        } ${stats.requests} sent this session, ${stats.notModified} of them free (nothing had changed).`}
      >
        API {rateLimit.remaining}
      </span>
      {lastSyncedAt ? (
        <span className="faint" title={lastSyncedAt.toLocaleString()}>
          synced {lastSyncedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      ) : null}
    </div>
  );
}

export function Toasts() {
  const { toasts, dismissToast } = useWorkspace();
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`glass-solid toast ${t.tone}`}>
          <span style={{ flex: 1 }}>{t.message}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export { NAV, SCREENS };
