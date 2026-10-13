/**
 * The one place that holds the workspace in memory and keeps it in step with GitHub.
 *
 * How saving works, in order:
 *   1. change the screen immediately (optimistic), so Board never feels slow;
 *   2. re-fetch the issue and compare it with the version you started from;
 *   3. if the other person touched the same field, stop and ask;
 *   4. otherwise save, and on failure put the old version back with a toast.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { config, isMockMode } from '../config';
import type { Api } from '../lib/api';
import { BackoffError, GitHubApi, type RateLimit, type ViewerInfo } from '../lib/github';
import { MockApi } from '../lib/mock';
import { storage } from '../lib/storage';
import { changeStatus } from '../lib/labels';
import { updateMeta, writeMeta } from '../lib/metadata';
import {
  detectConflicts,
  readField,
  resolveConflicts,
  type EditableField,
  type FieldConflict,
} from '../lib/conflict';
import type { ActivityItem, Member, Project, Status, Task } from '../lib/types';

// --- toasts -----------------------------------------------------------------

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error' | 'success';
}

// --- what a save looks like --------------------------------------------------

/** The editable fields, as plain strings. Exactly what the conflict checker wants. */
export type TaskPatch = Partial<Record<EditableField, string>>;

export interface SaveResult {
  ok: boolean;
  /** Present when we stopped because the other person had changed the same thing. */
  conflicts?: FieldConflict[];
  /** The version GitHub has right now, for the "both versions" dialog. */
  latest?: Task;
}

interface WorkspaceValue {
  api: Api;
  viewer: ViewerInfo;
  me: string;
  members: Member[];
  tasks: Task[];
  projects: Project[];
  activity: ActivityItem[];
  clients: string[];
  loading: boolean;
  offline: boolean;
  rateLimit: RateLimit;
  backoffUntil: Date | null;
  stats: { requests: number; notModified: number; writes: number };
  lastSyncedAt: Date | null;
  /** When the app was last open, for the "what changed" feed. */
  lastOpenedAt: string | null;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  notify: (message: string, tone?: Toast['tone']) => void;
  refresh: (reason?: string) => Promise<void>;
  saveTask: (number: number, patch: TaskPatch, base: Task, force?: Record<string, 'mine' | 'theirs'>) => Promise<SaveResult>;
  moveTask: (number: number, next: Status) => Promise<void>;
  setDue: (number: number, due: string | null) => Promise<void>;
  createTask: (input: {
    title: string;
    body: string;
    status: Status;
    priority: string | null;
    client: string | null;
    assignees: string[];
    milestone: number | null;
    due: string | null;
    estimate: string | null;
  }) => Promise<Task | null>;
  addComment: (number: number, body: string) => Promise<boolean>;
  createProject: (title: string, dueOn: string | null, description: string) => Promise<void>;
  signOut: () => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace used outside the provider');
  return value;
}

// --- helpers ----------------------------------------------------------------

/** Turn a patch of display strings into the body/labels/etc GitHub wants. */
function buildApiPatch(base: Task, patch: TaskPatch) {
  const result: Record<string, unknown> = {};
  let labels = [
    `status: ${patch.status ?? base.status}`,
    ...(patch.priority !== undefined
      ? patch.priority
        ? [`priority: ${patch.priority}`]
        : []
      : base.priority
        ? [`priority: ${base.priority}`]
        : []),
    ...(patch.client !== undefined
      ? patch.client
        ? [`client: ${patch.client}`]
        : []
      : base.client
        ? [`client: ${base.client}`]
        : []),
    ...base.otherLabels,
  ];

  if (patch.title !== undefined) result.title = patch.title;

  // Body, due and estimate all live in the same issue body, so they are worked out
  // together. writeMeta puts the description back with the hidden block untouched.
  let rawBody = base.rawBody;
  if (patch.body !== undefined) rawBody = writeMeta(patch.body, base.meta);
  if (patch.due !== undefined) rawBody = updateMeta(rawBody, { due: patch.due });
  if (patch.estimate !== undefined) rawBody = updateMeta(rawBody, { estimate: patch.estimate });
  if (patch.body !== undefined || patch.due !== undefined || patch.estimate !== undefined) {
    result.body = rawBody;
  }

  if (patch.assignees !== undefined) {
    result.assignees = patch.assignees
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (patch.status !== undefined && patch.status !== base.status) {
    const change = changeStatus(
      [
        ...(base.priority ? [`priority: ${base.priority}`] : []),
        ...(base.client ? [`client: ${base.client}`] : []),
        ...base.otherLabels,
      ],
      base.state,
      patch.status as Status,
    );
    labels = change.labels;
    if (change.state) result.state = change.state;
    if (change.stateReason) result.state_reason = change.stateReason;
  }

  result.labels = labels;
  return result;
}

/** Apply a patch to the in-memory task, so the screen can update before the save. */
function applyPatchLocally(task: Task, patch: TaskPatch, projects: Project[]): Task {
  const next: Task = { ...task, meta: { ...task.meta } };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.body !== undefined) next.body = patch.body;
  if (patch.status !== undefined) {
    next.status = patch.status as Status;
    next.state = patch.status === 'done' ? 'closed' : 'open';
  }
  if (patch.priority !== undefined) next.priority = (patch.priority || null) as Task['priority'];
  if (patch.client !== undefined) next.client = patch.client || null;
  if (patch.assignees !== undefined) {
    next.assignees = patch.assignees.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (patch.milestone !== undefined) {
    next.milestone = projects.find((p) => p.title === patch.milestone) ?? null;
  }
  if (patch.due !== undefined) {
    if (patch.due) next.meta.due = patch.due;
    else delete next.meta.due;
  }
  if (patch.estimate !== undefined) {
    if (patch.estimate) next.meta.estimate = patch.estimate;
    else delete next.meta.estimate;
  }
  return next;
}

// --- the provider -------------------------------------------------------------

export function WorkspaceProvider({
  token,
  viewer,
  onSignOut,
  children,
}: {
  token: string;
  viewer: ViewerInfo;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const api = useMemo<Api>(() => (isMockMode ? new MockApi() : new GitHubApi(token)), [token]);

  const [tasks, setTasks] = useState<Task[]>(() => storage.getCache<Task[]>('tasks') ?? []);
  const [projects, setProjects] = useState<Project[]>(() => storage.getCache<Project[]>('projects') ?? []);
  const [members, setMembers] = useState<Member[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [clients, setClients] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [rateLimit, setRateLimit] = useState<RateLimit>(api.rateLimit);
  const [backoffUntil, setBackoffUntil] = useState<Date | null>(null);
  const [stats, setStats] = useState({ ...api.stats });
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Captured once, before we overwrite it, so the Home feed can say what changed.
  const lastOpenedAt = useRef<string | null>(storage.getLastOpened());

  const toastId = useRef(1);
  const notify = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = toastId.current++;
    setToasts((current) => [...current, { id, message, tone }]);
    // Errors stay longer, because you need time to read them.
    window.setTimeout(() => setToasts((c) => c.filter((t) => t.id !== id)), tone === 'error' ? 8000 : 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((c) => c.filter((t) => t.id !== id));
  }, []);

  // Keep the status bar in step with the API client.
  useEffect(() => {
    api.onStateChange = () => {
      setRateLimit({ ...api.rateLimit });
      setBackoffUntil(api.backoffUntil);
      setStats({ ...api.stats });
    };
    return () => {
      api.onStateChange = null;
    };
  }, [api]);

  useEffect(() => {
    const online = () => setOffline(false);
    const down = () => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', down);
    };
  }, []);

  const refresh = useCallback(
    async (reason = 'poll') => {
      if (!navigator.onLine) {
        setOffline(true);
        return;
      }
      try {
        const [{ tasks: fetched, fresh }, fetchedProjects] = await Promise.all([
          api.listTasks(),
          api.listProjects(),
        ]);
        // On a 304 the data is identical to what we already have, so skip the
        // state update entirely and save React the re-render.
        if (fresh) {
          setTasks(fetched);
          storage.setCache('tasks', fetched);
        }
        setProjects((current) =>
          JSON.stringify(current) === JSON.stringify(fetchedProjects) ? current : fetchedProjects,
        );
        storage.setCache('projects', fetchedProjects);
        setLastSyncedAt(new Date());
        setOffline(false);
      } catch (error) {
        if (error instanceof BackoffError) {
          // Expected: we are deliberately waiting. No toast, the indicator shows it.
          return;
        }
        if (reason === 'manual') notify(`Could not reach GitHub: ${String(error)}`, 'error');
        setOffline(!navigator.onLine);
      }
    },
    [api, notify],
  );

  // First load: labels, members, clients, tasks.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const created = await api.ensureLabels();
        if (created.length && !cancelled) {
          notify(`Created ${created.length} missing label${created.length > 1 ? 's' : ''} in ${config.dataRepo}.`, 'success');
        }
      } catch (error) {
        if (!cancelled && !(error instanceof BackoffError)) {
          notify('Could not check the labels. You may not have write access.', 'error');
        }
      }
      try {
        const [fetchedMembers, labels] = await Promise.all([api.getMembers(), api.listLabels()]);
        if (!cancelled) {
          setMembers(fetchedMembers);
          setClients(
            labels.filter((l) => l.startsWith('client: ')).map((l) => l.slice('client: '.length)).sort(),
          );
        }
      } catch {
        /* non-fatal */
      }
      await refresh('first');
      if (!cancelled) {
        setLoading(false);
        storage.setLastOpened(new Date().toISOString());
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // Polling: often while you are looking, rarely while you are not.
  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      const wait = document.visibilityState === 'visible' ? config.pollVisibleMs : config.pollHiddenMs;
      timer = window.setTimeout(async () => {
        await refresh('poll');
        schedule();
      }, wait);
    };
    const onVisible = () => {
      // Coming back to the window: refresh at once, then restart the timer.
      if (document.visibilityState === 'visible') void refresh('focus');
      schedule();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // Activity is bigger and changes slowly, so it is fetched on its own slower beat.
  useEffect(() => {
    let timer: number | undefined;
    const tick = async () => {
      try {
        setActivity(await api.listActivity());
      } catch {
        /* non-fatal */
      }
      timer = window.setTimeout(tick, 120_000);
    };
    void tick();
    return () => window.clearTimeout(timer);
  }, [api]);

  // --- writes ---------------------------------------------------------------

  const replaceTask = useCallback((task: Task) => {
    setTasks((current) => {
      const next = current.some((t) => t.number === task.number)
        ? current.map((t) => (t.number === task.number ? task : t))
        : [task, ...current];
      storage.setCache('tasks', next);
      return next;
    });
  }, []);

  const saveTask = useCallback<WorkspaceValue['saveTask']>(
    async (number, patch, base, choices) => {
      const before = tasks.find((t) => t.number === number) ?? base;

      // 1. Optimistic: show it straight away.
      replaceTask(applyPatchLocally(before, patch, projects));

      try {
        // 2. What does GitHub have right now?
        const latest = await api.getTask(number);
        let effective = patch;
        // If nobody touched the issue we build on our own copy; if they did, we build
        // on THEIRS, so the fields they changed and we are not touching survive.
        let buildOn = base;

        if (latest.updatedAt !== base.updatedAt) {
          buildOn = latest;
          const conflicts = detectConflicts(base, latest, patch);
          if (conflicts.length > 0) {
            if (!choices) {
              // 3. Stop and ask. Show GitHub's version in the meantime.
              replaceTask(latest);
              return { ok: false, conflicts, latest };
            }
            effective = resolveConflicts(patch, conflicts, choices);
          }
          if (Object.keys(effective).length === 0) {
            // Everything was given up to the other person; nothing left to save.
            replaceTask(latest);
            return { ok: true };
          }
        }

        if (effective.client) await api.ensureClientLabel(`client: ${effective.client}`);
        const apiPatch = buildApiPatch(buildOn, effective);
        if (effective.milestone !== undefined) {
          const project = projects.find((p) => p.title === effective.milestone);
          apiPatch.milestone = project ? project.number : null;
        }
        const saved = await api.updateTask(number, apiPatch);
        replaceTask(saved);
        return { ok: true };
      } catch (error) {
        // 4. Put it back the way it was and say so.
        replaceTask(before);
        const message =
          error instanceof BackoffError
            ? `GitHub asked us to slow down. Try again after ${error.until.toLocaleTimeString()}.`
            : `Could not save: ${error instanceof Error ? error.message : String(error)}`;
        notify(message, 'error');
        return { ok: false };
      }
    },
    [api, tasks, projects, replaceTask, notify],
  );

  /** Drag-and-drop on the board, and the status buttons. */
  const moveTask = useCallback<WorkspaceValue['moveTask']>(
    async (number, next) => {
      const base = tasks.find((t) => t.number === number);
      if (!base || base.status === next) return;
      const result = await saveTask(number, { status: next }, base);
      if (result.conflicts) {
        notify(
          `Someone changed "${base.title}" while you were looking. Open the task to see both versions.`,
          'error',
        );
      }
    },
    [tasks, saveTask, notify],
  );

  /** Dragging a task to another day in the calendar. */
  const setDue = useCallback<WorkspaceValue['setDue']>(
    async (number, due) => {
      const base = tasks.find((t) => t.number === number);
      if (!base) return;
      await saveTask(number, { due: due ?? '' }, base);
    },
    [tasks, saveTask],
  );

  const createTask = useCallback<WorkspaceValue['createTask']>(
    async (input) => {
      try {
        if (input.client) await api.ensureClientLabel(`client: ${input.client}`);
        const body = updateMeta(input.body, {
          due: input.due ?? '',
          estimate: input.estimate ?? '',
        });
        const task = await api.createTask({
          title: input.title,
          body,
          labels: [
            `status: ${input.status}`,
            ...(input.priority ? [`priority: ${input.priority}`] : []),
            ...(input.client ? [`client: ${input.client}`] : []),
          ],
          assignees: input.assignees,
          milestone: input.milestone,
        });
        replaceTask(task);
        notify(`Created #${task.number}`, 'success');
        return task;
      } catch (error) {
        notify(`Could not create the task: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return null;
      }
    },
    [api, replaceTask, notify],
  );

  const addComment = useCallback<WorkspaceValue['addComment']>(
    async (number, body) => {
      try {
        await api.addComment(number, body);
        await refresh('manual');
        return true;
      } catch (error) {
        notify(`Could not post the comment: ${error instanceof Error ? error.message : String(error)}`, 'error');
        return false;
      }
    },
    [api, refresh, notify],
  );

  const createProject = useCallback<WorkspaceValue['createProject']>(
    async (title, dueOn, description) => {
      try {
        const project = await api.createProject(title, dueOn, description);
        setProjects((c) => [...c, project]);
        notify(`Created project "${title}"`, 'success');
      } catch (error) {
        notify(`Could not create the project: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    },
    [api, notify],
  );

  const signOut = useCallback(() => {
    storage.forgetEverything();
    onSignOut();
  }, [onSignOut]);

  const value: WorkspaceValue = {
    api,
    viewer,
    me: viewer.login,
    members,
    tasks,
    projects,
    activity,
    clients,
    loading,
    offline,
    rateLimit,
    backoffUntil,
    stats,
    lastSyncedAt,
    lastOpenedAt: lastOpenedAt.current,
    toasts,
    dismissToast,
    notify,
    refresh,
    saveTask,
    moveTask,
    setDue,
    createTask,
    addComment,
    createProject,
    signOut,
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export { readField };
