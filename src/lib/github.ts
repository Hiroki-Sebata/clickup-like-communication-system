/**
 * Everything that talks to GitHub.
 *
 * Three things make this more than a thin wrapper around Octokit:
 *
 *  1. Conditional requests. Every GET sends If-None-Match with the ETag GitHub gave
 *     us last time. If nothing changed GitHub replies 304 Not Modified, which does
 *     NOT count against your hourly rate limit. This is why polling every 30 seconds
 *     is affordable.
 *  2. A rate-limit reading, taken from the response headers of every call, so the
 *     status bar can show how much budget is left.
 *  3. Automatic back-off. If GitHub replies 403 or 429 we stop calling until the time
 *     it tells us to wait, rather than hammering it.
 */
import { Octokit } from 'octokit';
import { config } from '../config';
import {
  CLIENT_LABEL_COLOUR,
  LABEL_COLOURS,
  LABEL_DESCRIPTIONS,
  REQUIRED_LABELS,
  clientFromLabels,
  otherLabels,
  priorityFromLabels,
  statusFromLabels,
} from './labels';
import { parseBody } from './metadata';
import type { ActivityItem, Comment, Member, Project, Task } from './types';

export interface RateLimit {
  remaining: number;
  limit: number;
  /** When the hourly budget refills. */
  resetAt: Date | null;
}

export interface ViewerInfo {
  login: string;
  name: string | null;
  avatarUrl: string;
  /** Null when GitHub does not tell us (classic tokens, or no expiry set). */
  tokenExpiresAt: Date | null;
}

/**
 * The HTTP status of a failed request, or null if it was not an HTTP failure.
 *
 * Deliberately NOT `error instanceof RequestError`. Octokit's plugins can each
 * carry their own copy of that class, so the error thrown at runtime is often a
 * *different* class from the one imported here, and instanceof quietly returns
 * false. That turned a handled 404 into an unhandled one, and it does not show
 * up in a unit test that throws the imported class itself. Reading .status works
 * whichever copy produced the error.
 */
function httpStatus(error: unknown): number | null {
  const status = (error as { status?: unknown })?.status;
  return typeof status === 'number' ? status : null;
}

/** The response headers off a failed request, whichever copy of the error class it is. */
function errorHeaders(error: unknown): Record<string, string> {
  return ((error as { response?: { headers?: Record<string, string> } })?.response?.headers ??
    {}) as Record<string, string>;
}

/** Thrown when we are deliberately holding off because GitHub asked us to. */
export class BackoffError extends Error {
  constructor(public readonly until: Date) {
    super(`GitHub asked us to wait until ${until.toLocaleTimeString()}`);
    this.name = 'BackoffError';
  }
}

interface CacheEntry {
  etag: string;
  data: unknown;
}

export class GitHubApi {
  private octokit: Octokit;
  private owner = config.dataOwner;
  private repo = config.dataRepo;

  /** ETag + last payload for each URL we poll. Lives for the browser session only. */
  private cache = new Map<string, CacheEntry>();

  /** Set when GitHub told us to slow down. */
  private blockedUntil: Date | null = null;

  rateLimit: RateLimit = { remaining: 5000, limit: 5000, resetAt: null };
  tokenExpiresAt: Date | null = null;

  /** Counters, shown in the status bar and used in the README's request table. */
  readonly stats = { requests: 0, notModified: 0, writes: 0 };

  /** Called whenever the rate limit or back-off state changes, so the UI can redraw. */
  onStateChange: (() => void) | null = null;

  constructor(token: string) {
    this.octokit = new Octokit({
      auth: token,
      userAgent: 'board-app',
      // We do our own back-off and our own retrying, so the built-in plugins are off.
      // Two systems retrying the same request at once is how you get a thundering herd.
      throttle: { enabled: false },
      retry: { enabled: false },
    });
  }

  // --- plumbing ------------------------------------------------------------

  private get repoParams() {
    return { owner: this.owner, repo: this.repo };
  }

  /**
   * owner/repo belong only on routes that name them. Sending them to an account
   * route like /user just tacks on meaningless query parameters.
   */
  private paramsFor(route: string, params: Record<string, unknown>) {
    const needsRepo = route.includes('{owner}') || route.includes('{repo}');
    return needsRepo ? { ...this.repoParams, ...params } : { ...params };
  }

  /** Read the useful headers off any response. */
  private noteHeaders(headers: Record<string, unknown>): void {
    const remaining = headers['x-ratelimit-remaining'];
    const limit = headers['x-ratelimit-limit'];
    const reset = headers['x-ratelimit-reset'];
    if (remaining !== undefined) {
      this.rateLimit = {
        remaining: Number(remaining),
        limit: Number(limit ?? this.rateLimit.limit),
        resetAt: reset ? new Date(Number(reset) * 1000) : this.rateLimit.resetAt,
      };
    }
    // Fine-grained tokens report their own expiry date here.
    const expiry = headers['github-authentication-token-expiration'];
    if (typeof expiry === 'string' && expiry) {
      const parsed = new Date(expiry.replace(' ', 'T').replace(' ', ''));
      if (!Number.isNaN(parsed.getTime())) this.tokenExpiresAt = parsed;
    }
    this.onStateChange?.();
  }

  /** Work out how long GitHub wants us to wait after a 403/429. */
  private noteBackoff(error: unknown): void {
    const headers = errorHeaders(error);
    const retryAfter = headers['retry-after'];
    const reset = headers['x-ratelimit-reset'];

    let until: Date;
    if (retryAfter) {
      until = new Date(Date.now() + Number(retryAfter) * 1000);
    } else if (reset && headers['x-ratelimit-remaining'] === '0') {
      until = new Date(Number(reset) * 1000);
    } else {
      // Secondary rate limit with no headers: GitHub's own advice is a minute.
      until = new Date(Date.now() + 60_000);
    }
    this.blockedUntil = until;
    this.onStateChange?.();
  }

  /** True while we are holding off. The UI greys out the sync indicator. */
  get isBackingOff(): boolean {
    if (!this.blockedUntil) return false;
    if (this.blockedUntil.getTime() <= Date.now()) {
      this.blockedUntil = null;
      return false;
    }
    return true;
  }

  get backoffUntil(): Date | null {
    return this.isBackingOff ? this.blockedUntil : null;
  }

  /**
   * A GET that uses If-None-Match. Returns the cached value unchanged on a 304,
   * and tells the caller which it was.
   */
  private async conditionalGet<T>(
    cacheKey: string,
    route: string,
    params: Record<string, unknown> = {},
  ): Promise<{ data: T; fresh: boolean }> {
    if (this.isBackingOff) throw new BackoffError(this.blockedUntil!);

    const cached = this.cache.get(cacheKey);
    try {
      this.stats.requests++;
      const response = await this.octokit.request(route, {
        ...this.paramsFor(route, params),
        headers: cached ? { 'if-none-match': cached.etag } : {},
      });
      this.noteHeaders(response.headers as Record<string, unknown>);
      const etag = (response.headers as Record<string, string>).etag;
      if (etag) this.cache.set(cacheKey, { etag, data: response.data });
      return { data: response.data as T, fresh: true };
    } catch (error) {
      const status = httpStatus(error);
      if (status !== null) {
        if (status === 304 && cached) {
          // Free of charge: the data we already have is still correct.
          this.stats.notModified++;
          this.noteHeaders(errorHeaders(error) as Record<string, unknown>);
          return { data: cached.data as T, fresh: false };
        }
        if (status === 403 || status === 429) {
          this.noteBackoff(error);
          throw new BackoffError(this.blockedUntil!);
        }
      }
      throw error;
    }
  }

  /** A plain request, for writes. Writes are never conditional. */
  private async send<T>(route: string, params: Record<string, unknown> = {}): Promise<T> {
    if (this.isBackingOff) throw new BackoffError(this.blockedUntil!);
    try {
      this.stats.requests++;
      this.stats.writes++;
      const response = await this.octokit.request(route, this.paramsFor(route, params));
      this.noteHeaders(response.headers as Record<string, unknown>);
      return response.data as T;
    } catch (error) {
      const status = httpStatus(error);
      if (status === 403 || status === 429) {
        this.noteBackoff(error);
        throw new BackoffError(this.blockedUntil!);
      }
      throw error;
    }
  }

  /**
   * Fetch every page of a list, each page with its own ETag. `fresh` is false only
   * when every page came back 304, i.e. truly nothing changed.
   */
  private async conditionalGetAll<T>(
    cacheKey: string,
    route: string,
    params: Record<string, unknown> = {},
    maxPages = 10,
  ): Promise<{ data: T[]; fresh: boolean }> {
    const all: T[] = [];
    let fresh = false;
    for (let page = 1; page <= maxPages; page++) {
      const result = await this.conditionalGet<T[]>(`${cacheKey}#${page}`, route, {
        ...params,
        per_page: 100,
        page,
      });
      if (result.fresh) fresh = true;
      all.push(...result.data);
      if (result.data.length < 100) break;
    }
    return { data: all, fresh };
  }

  // --- sign in -------------------------------------------------------------

  /**
   * Who does this token belong to?
   *
   * GET /user is an ACCOUNT-level endpoint. A fine-grained token scoped to a single
   * repository — which is exactly what Board asks you to make — has no account
   * permissions, and GitHub answers with 404 rather than 403, to avoid confirming
   * what exists.
   *
   * So this is allowed to fail, and returns null when it does. Identity is a
   * convenience; access to the tasks repository is the thing that actually matters,
   * and that is checked separately. When this returns null the app asks you which
   * collaborator you are instead.
   */
  async getViewer(): Promise<ViewerInfo | null> {
    try {
      const data = await this.send<{ login: string; name: string | null; avatar_url: string }>(
        'GET /user',
      );
      return {
        login: data.login,
        name: data.name,
        avatarUrl: data.avatar_url,
        tokenExpiresAt: this.tokenExpiresAt,
      };
    } catch (error) {
      // 403/404 here means "this token is repo-scoped", which is correct and fine.
      const status = httpStatus(error);
      if (status === 404 || status === 403) {
        return null;
      }
      if (error instanceof BackoffError) return null;
      throw error; // 401 and network failures are real problems, and must surface.
    }
  }

  /** Build an identity from a collaborator the person picked themselves. */
  viewerFromMember(member: Member): ViewerInfo {
    return {
      login: member.login,
      name: member.name ?? member.login,
      avatarUrl: member.avatarUrl,
      tokenExpiresAt: this.tokenExpiresAt,
    };
  }

  /** Check the token can actually see the data repository. */
  async checkRepoAccess(): Promise<{ ok: true } | { ok: false; reason: string }> {
    try {
      await this.send('GET /repos/{owner}/{repo}');
      return { ok: true };
    } catch (error) {
      const status = httpStatus(error);
      if (status !== null) {
        if (status === 404) {
          return {
            ok: false,
            reason: `Cannot see ${this.owner}/${this.repo}. Either the repository does not exist yet, or the token was not given access to it.`,
          };
        }
        const detail = error instanceof Error ? error.message : String(error);
        return { ok: false, reason: `GitHub said: ${status} ${detail}` };
      }
      return { ok: false, reason: String(error) };
    }
  }

  /**
   * The team. Read from the repository's collaborators so nobody's username is
   * baked into the public app code.
   */
  async getMembers(): Promise<Member[]> {
    try {
      const { data } = await this.conditionalGetAll<{
        login: string;
        avatar_url: string;
        name?: string | null;
      }>('collaborators', 'GET /repos/{owner}/{repo}/collaborators', { affiliation: 'all' });
      return data.map((u) => ({ login: u.login, avatarUrl: u.avatar_url, name: u.name ?? undefined }));
    } catch {
      // A token without Metadata read cannot list collaborators. Fall back to the
      // names in the config file, and to whoever we have seen on a task.
      return config.fallbackMembers.map((login) => ({
        login,
        avatarUrl: `https://avatars.githubusercontent.com/${login}`,
      }));
    }
  }

  // --- first run -----------------------------------------------------------

  /**
   * Make sure all the status and priority labels exist, with the right colours.
   * Safe to call every time the app starts: it only creates what is missing.
   */
  async ensureLabels(): Promise<string[]> {
    const { data } = await this.conditionalGetAll<{ name: string }>(
      'labels',
      'GET /repos/{owner}/{repo}/labels',
    );
    const existing = new Set(data.map((l) => l.name));
    const created: string[] = [];
    for (const name of REQUIRED_LABELS) {
      if (existing.has(name)) continue;
      await this.send('POST /repos/{owner}/{repo}/labels', {
        name,
        color: LABEL_COLOURS[name],
        description: LABEL_DESCRIPTIONS[name] ?? '',
      });
      created.push(name);
    }
    if (created.length) this.cache.delete('labels#1');
    return created;
  }

  /** Every label currently in the repo, so the UI can offer existing clients. */
  async listLabels(): Promise<string[]> {
    const { data } = await this.conditionalGetAll<{ name: string }>(
      'labels',
      'GET /repos/{owner}/{repo}/labels',
    );
    return data.map((l) => l.name);
  }

  /** Create a "client: X" label the first time that client is used. */
  async ensureClientLabel(name: string): Promise<void> {
    try {
      await this.send('POST /repos/{owner}/{repo}/labels', {
        name,
        color: CLIENT_LABEL_COLOUR,
        description: 'Client',
      });
      this.cache.delete('labels#1');
    } catch (error) {
      // 422 means it already exists, which is exactly what we wanted.
      if (httpStatus(error) !== 422) throw error;
    }
  }

  // --- tasks ---------------------------------------------------------------

  async listTasks(): Promise<{ tasks: Task[]; fresh: boolean }> {
    const { data, fresh } = await this.conditionalGetAll<RawIssue>(
      'issues',
      'GET /repos/{owner}/{repo}/issues',
      { state: 'all', sort: 'updated', direction: 'desc' },
    );
    // The issues endpoint also returns pull requests; Board has no use for those.
    const tasks = data.filter((i) => !i.pull_request).map(toTask);
    return { tasks, fresh };
  }

  /** One issue, fetched fresh. Used before saving, to spot a clash. */
  async getTask(number: number): Promise<Task> {
    const data = await this.send<RawIssue>('GET /repos/{owner}/{repo}/issues/{issue_number}', {
      issue_number: number,
    });
    return toTask(data);
  }

  async createTask(input: {
    title: string;
    body: string;
    labels: string[];
    assignees: string[];
    milestone?: number | null;
  }): Promise<Task> {
    const data = await this.send<RawIssue>('POST /repos/{owner}/{repo}/issues', {
      title: input.title,
      body: input.body,
      labels: input.labels,
      assignees: input.assignees,
      ...(input.milestone ? { milestone: input.milestone } : {}),
    });
    this.invalidateIssues();
    return toTask(data);
  }

  async updateTask(
    number: number,
    patch: {
      title?: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
      milestone?: number | null;
      state?: 'open' | 'closed';
      state_reason?: 'completed' | 'reopened' | null;
    },
  ): Promise<Task> {
    const data = await this.send<RawIssue>('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
      issue_number: number,
      ...patch,
    });
    this.invalidateIssues();
    return toTask(data);
  }

  /** After a write, the cached issue list is stale, so drop its ETags. */
  private invalidateIssues(): void {
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith('issues#') || key.startsWith('activity')) this.cache.delete(key);
    }
  }

  // --- comments ------------------------------------------------------------

  async listComments(number: number): Promise<Comment[]> {
    const { data } = await this.conditionalGetAll<RawComment>(
      `comments:${number}`,
      'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
      { issue_number: number },
    );
    return data.map(toComment);
  }

  async addComment(number: number, body: string): Promise<Comment> {
    const data = await this.send<RawComment>(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      { issue_number: number, body },
    );
    this.cache.delete(`comments:${number}#1`);
    this.invalidateIssues();
    return toComment(data);
  }

  // --- projects (milestones) -----------------------------------------------

  async listProjects(): Promise<Project[]> {
    const { data } = await this.conditionalGetAll<RawMilestone>(
      'milestones',
      'GET /repos/{owner}/{repo}/milestones',
      { state: 'all', sort: 'due_on', direction: 'asc' },
    );
    return data.map(toProject);
  }

  async createProject(title: string, dueOn: string | null, description: string): Promise<Project> {
    const data = await this.send<RawMilestone>('POST /repos/{owner}/{repo}/milestones', {
      title,
      description,
      // GitHub wants a timestamp; midday avoids any timezone rounding surprises.
      ...(dueOn ? { due_on: `${dueOn}T12:00:00Z` } : {}),
    });
    this.cache.delete('milestones#1');
    return toProject(data);
  }

  // --- activity ------------------------------------------------------------

  /** Recent events and comments across the whole repository. */
  async listActivity(): Promise<ActivityItem[]> {
    const [events, comments] = await Promise.all([
      this.conditionalGet<RawEvent[]>('activity:events', 'GET /repos/{owner}/{repo}/issues/events', {
        per_page: 50,
      }),
      this.conditionalGet<RawComment[]>('activity:comments', 'GET /repos/{owner}/{repo}/issues/comments', {
        sort: 'created',
        direction: 'desc',
        per_page: 30,
      }),
    ]);

    const items: ActivityItem[] = [];

    for (const e of events.data) {
      // Only the events a two-person team actually cares about.
      if (!['closed', 'reopened', 'assigned', 'unassigned', 'labeled', 'milestoned'].includes(e.event)) continue;
      items.push({
        id: `e${e.id}`,
        kind: 'event',
        verb: e.event,
        actor: e.actor?.login ?? 'someone',
        avatarUrl: e.actor?.avatar_url ?? '',
        issueNumber: e.issue?.number ?? 0,
        issueTitle: e.issue?.title ?? '',
        at: e.created_at,
        detail: e.label?.name ?? e.assignee?.login ?? e.milestone?.title,
      });
    }

    for (const c of comments.data) {
      const number = Number(c.issue_url?.split('/').pop() ?? 0);
      items.push({
        id: `c${c.id}`,
        kind: 'comment',
        verb: 'commented',
        actor: c.user?.login ?? 'someone',
        avatarUrl: c.user?.avatar_url ?? '',
        issueNumber: number,
        issueTitle: '',
        at: c.created_at,
        detail: c.body.slice(0, 160),
      });
    }

    return items.sort((a, b) => b.at.localeCompare(a.at));
  }
}

// --- turning GitHub's JSON into our own shapes -------------------------------

interface RawIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<{ name: string } | string>;
  assignees: Array<{ login: string }> | null;
  milestone: RawMilestone | null;
  comments: number;
  created_at: string;
  updated_at: string;
  user: { login: string } | null;
  html_url: string;
  pull_request?: unknown;
}

interface RawComment {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
  user: { login: string; avatar_url: string } | null;
  issue_url?: string;
}

interface RawMilestone {
  number: number;
  title: string;
  description: string | null;
  due_on: string | null;
  open_issues: number;
  closed_issues: number;
  state: 'open' | 'closed';
}

interface RawEvent {
  id: number;
  event: string;
  created_at: string;
  actor: { login: string; avatar_url: string } | null;
  issue?: { number: number; title: string };
  label?: { name: string };
  assignee?: { login: string };
  milestone?: { title: string };
}

export function toTask(raw: RawIssue): Task {
  const labels = raw.labels.map((l) => (typeof l === 'string' ? l : l.name));
  const { meta, body } = parseBody(raw.body);
  return {
    number: raw.number,
    title: raw.title,
    body,
    rawBody: raw.body ?? '',
    state: raw.state,
    status: statusFromLabels(labels, raw.state),
    priority: priorityFromLabels(labels),
    client: clientFromLabels(labels),
    otherLabels: otherLabels(labels),
    assignees: (raw.assignees ?? []).map((a) => a.login),
    milestone: raw.milestone ? toProject(raw.milestone) : null,
    meta,
    comments: raw.comments,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    author: raw.user?.login ?? 'unknown',
    htmlUrl: raw.html_url,
  };
}

function toComment(raw: RawComment): Comment {
  return {
    id: raw.id,
    author: raw.user?.login ?? 'unknown',
    avatarUrl: raw.user?.avatar_url ?? '',
    body: raw.body,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function toProject(raw: RawMilestone): Project {
  return {
    number: raw.number,
    title: raw.title,
    description: raw.description,
    dueOn: raw.due_on ? raw.due_on.slice(0, 10) : null,
    openIssues: raw.open_issues,
    closedIssues: raw.closed_issues,
    state: raw.state,
  };
}

/** All the labels Board needs on a task, rebuilt from scratch. */
export function buildLabels(parts: {
  status: string;
  priority: string | null;
  client: string | null;
  others: string[];
}): string[] {
  return [
    parts.status,
    ...(parts.priority ? [parts.priority] : []),
    ...(parts.client ? [parts.client] : []),
    ...parts.others,
  ];
}
