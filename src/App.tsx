/**
 * The root: decides between the sign-in panel and the app, owns the keyboard
 * shortcuts, and places the screens inside the shell.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isMockMode } from './config';
import type { ViewerInfo } from './lib/github';
import { GitHubApi } from './lib/github';
import { MockApi } from './lib/mock';
import { storage } from './lib/storage';
import { SCREENS, closeTask, go, openTask, useRoute, type ScreenName } from './lib/router';
import { WorkspaceProvider, useWorkspace } from './state/store';
import { useTheme } from './state/theme';
import { SignIn } from './components/SignIn';
import { Sidebar, TopBar, Toasts } from './components/Shell';
import { TaskPanel } from './components/TaskPanel';
import { NewTask } from './components/NewTask';
import { Home } from './screens/Home';
import { Board } from './screens/Board';
import { List } from './screens/List';
import { Calendar } from './screens/Calendar';
import { Projects } from './screens/Projects';
import { Activity } from './screens/Activity';

export default function App() {
  const [token, setToken] = useState<string | null>(() => storage.getToken());
  const [viewer, setViewer] = useState<ViewerInfo | null>(null);
  const [checking, setChecking] = useState(!!storage.getToken());

  // A token saved on a previous visit: check it still works before showing the app.
  useEffect(() => {
    if (!token || viewer) return;
    let cancelled = false;
    (async () => {
      try {
        const api = isMockMode ? new MockApi() : new GitHubApi(token);
        const info = await api.getViewer();
        if (!cancelled) setViewer(info);
      } catch {
        // Expired or revoked: back to the sign-in panel.
        if (!cancelled) {
          storage.forgetEverything();
          setToken(null);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, viewer]);

  if (checking && token && !viewer) {
    return <div className="signin-wrap"><div className="glass-solid signin">Checking your token…</div></div>;
  }

  if (!token || !viewer) {
    return (
      <SignIn
        onSignedIn={(t, info) => {
          setToken(t);
          setViewer(info);
          setChecking(false);
        }}
      />
    );
  }

  return (
    <WorkspaceProvider
      token={token}
      viewer={viewer}
      onSignOut={() => {
        setToken(null);
        setViewer(null);
      }}
    >
      <Workspace />
    </WorkspaceProvider>
  );
}

function Workspace() {
  const route = useRoute();
  const { tasks, refresh } = useWorkspace();
  const { choice, cycle } = useTheme();
  const [search, setSearch] = useState('');
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // One "now" for the whole render, refreshed every minute, so every screen agrees
  // about what "today" means and nothing jumps mid-render.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const now = useMemo(() => new Date(nowTick), [nowTick]);

  const open = useCallback((n: number) => openTask(n, route), [route]);
  const close = useCallback(() => closeTask(route), [route]);

  // --- keyboard shortcuts ---------------------------------------------------
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if (event.key === 'Escape') {
        // Esc always works, even in a field: it closes whatever is on top.
        if (newTaskOpen) setNewTaskOpen(false);
        else if (route.taskNumber) close();
        else if (typing) (target as HTMLElement).blur();
        return;
      }

      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        setNewTaskOpen(true);
      } else if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (event.key >= '1' && event.key <= '5') {
        event.preventDefault();
        go(SCREENS[Number(event.key) - 1] as ScreenName);
      } else if (event.key === 'r') {
        void refresh('manual');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [route, newTaskOpen, close, refresh]);

  const task = route.taskNumber ? tasks.find((t) => t.number === route.taskNumber) ?? null : null;

  return (
    <div className="app">
      <Sidebar route={route} />
      <TopBar
        route={route}
        search={search}
        onSearch={setSearch}
        onNewTask={() => setNewTaskOpen(true)}
        theme={choice}
        onCycleTheme={cycle}
        searchRef={searchRef}
      />
      <main className="main">
        {route.screen === 'home' ? <Home onOpen={open} now={now} /> : null}
        {route.screen === 'board' ? <Board route={route} search={search} onOpen={open} now={now} /> : null}
        {route.screen === 'list' ? <List route={route} search={search} onOpen={open} now={now} /> : null}
        {route.screen === 'calendar' ? <Calendar route={route} search={search} onOpen={open} now={now} /> : null}
        {route.screen === 'projects' ? <Projects onOpen={open} now={now} /> : null}
        {route.screen === 'activity' ? <Activity onOpen={open} /> : null}
      </main>

      {task ? <TaskPanel task={task} onClose={close} /> : null}
      {route.taskNumber && !task ? (
        <>
          <div className="scrim" onClick={close} />
          <aside className="glass-solid panel">
            <div className="panel-body">
              <p>Task #{route.taskNumber} is not in the list.</p>
              <p className="faint">
                It may still be loading, or it may have been deleted. Close this and try again.
              </p>
              <button className="btn" onClick={close}>Close</button>
            </div>
          </aside>
        </>
      ) : null}

      {newTaskOpen ? (
        <NewTask onClose={() => setNewTaskOpen(false)} onCreated={open} />
      ) : null}

      <Toasts />
    </div>
  );
}
