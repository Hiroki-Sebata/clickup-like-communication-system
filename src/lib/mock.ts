/**
 * A fake GitHub, entirely in memory.
 *
 * Run `npm run dev:mock` and the whole app works with invented tasks: no token, no
 * repository, no rate limit. Useful for trying the interface and for showing someone
 * what Board looks like without exposing real client names.
 */
import type { Api } from './api';
import type { RateLimit, ViewerInfo } from './github';
import { toTask } from './github';
import { writeMeta } from './metadata';
import { REQUIRED_LABELS } from './labels';
import type { ActivityItem, Comment, Member, Project, Task } from './types';
import { toISODate } from './dates';

const ME = 'you';
const PARTNER = 'your-partner';
const avatar = (login: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="${
      login === ME ? '#4f6ff5' : '#c026d3'
    }"/><text x="20" y="26" font-family="sans-serif" font-size="16" fill="#fff" text-anchor="middle">${login[0].toUpperCase()}</text></svg>`,
  )}`;

/** A date `offset` days from today, as YYYY-MM-DD. */
function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return toISODate(d);
}

const MILESTONES: Project[] = [
  { number: 1, title: 'Acme Dental — new site', description: 'Full rebuild', dueOn: day(21), openIssues: 4, closedIssues: 2, state: 'open' },
  { number: 2, title: 'Studio Bloom — brand refresh', description: 'Logo and site', dueOn: day(45), openIssues: 2, closedIssues: 0, state: 'open' },
  { number: 3, title: 'Internal', description: 'Our own admin', dueOn: null, openIssues: 1, closedIssues: 1, state: 'open' },
];

interface Seed {
  title: string;
  body: string;
  status: string;
  priority?: string;
  client?: string;
  assignees: string[];
  due?: string;
  estimate?: string;
  milestone?: number;
  state?: 'open' | 'closed';
}

const SEEDS: Seed[] = [
  { title: 'Homepage hero copy', body: 'Rewrite the hero. Client wants **shorter**.', status: 'in progress', priority: 'high', client: 'Acme Dental', assignees: [ME], due: day(-2), estimate: '3h', milestone: 1 },
  { title: 'Booking form validation', body: 'Phone field accepts letters.\n\n- [ ] strip spaces\n- [ ] show inline error', status: 'todo', priority: 'urgent', client: 'Acme Dental', assignees: [ME], due: day(0), estimate: '2h', milestone: 1 },
  { title: 'Mobile nav overlaps logo', body: 'Only on iPhone SE width.', status: 'review', priority: 'normal', client: 'Acme Dental', assignees: [PARTNER], due: day(1), estimate: '1h', milestone: 1 },
  { title: 'Set up analytics', body: 'Plausible, not Google.', status: 'todo', priority: 'low', client: 'Acme Dental', assignees: [], due: day(4), milestone: 1 },
  { title: 'Logo lockup variants', body: 'Horizontal, stacked, icon only.', status: 'in progress', priority: 'normal', client: 'Studio Bloom', assignees: [ME], due: day(3), estimate: '1d', milestone: 2 },
  { title: 'Colour palette sign-off', body: 'Send three options.', status: 'review', priority: 'high', client: 'Studio Bloom', assignees: [PARTNER], due: day(2), milestone: 2 },
  { title: 'Invoice template', body: 'Ours, not a client job.', status: 'todo', priority: 'low', assignees: [], milestone: 3 },
  { title: 'Old contact form spam', body: 'Add a honeypot field.', status: 'done', priority: 'normal', client: 'Acme Dental', assignees: [ME], due: day(-9), state: 'closed', milestone: 1 },
  { title: 'Favicon set', body: 'All the sizes.', status: 'done', priority: 'low', client: 'Acme Dental', assignees: [PARTNER], state: 'closed', milestone: 1 },
  { title: 'Write the handover doc', body: 'For the client, plain language.', status: 'todo', priority: 'normal', client: 'Acme Dental', assignees: [ME], due: day(6), estimate: '2h', milestone: 1 },
  { title: 'Renew the domain', body: 'Expires soon.', status: 'todo', priority: 'urgent', assignees: [ME], due: day(-1), estimate: '15m', milestone: 3 },
];

export class MockApi implements Api {
  rateLimit: RateLimit = { remaining: 4987, limit: 5000, resetAt: new Date(Date.now() + 2_400_000) };
  tokenExpiresAt: Date | null = new Date(Date.now() + 40 * 86_400_000);
  isBackingOff = false;
  backoffUntil: Date | null = null;
  stats = { requests: 0, notModified: 0, writes: 0 };
  onStateChange: (() => void) | null = null;

  private tasks: Task[] = [];
  private comments = new Map<number, Comment[]>();
  private nextNumber = 1;
  private labels = new Set<string>(REQUIRED_LABELS);

  constructor() {
    for (const seed of SEEDS) this.tasks.push(this.seedToTask(seed));
    this.comments.set(1, [
      {
        id: 1,
        author: PARTNER,
        avatarUrl: avatar(PARTNER),
        body: `@${ME} the client sent a new version, it is in the shared folder.`,
        createdAt: new Date(Date.now() - 7_200_000).toISOString(),
        updatedAt: new Date(Date.now() - 7_200_000).toISOString(),
      },
    ]);
  }

  private seedToTask(seed: Seed): Task {
    const number = this.nextNumber++;
    const labels = [
      `status: ${seed.status}`,
      ...(seed.priority ? [`priority: ${seed.priority}`] : []),
      ...(seed.client ? [`client: ${seed.client}`] : []),
    ];
    labels.forEach((l) => this.labels.add(l));
    const milestone = MILESTONES.find((m) => m.number === seed.milestone) ?? null;
    return toTask({
      number,
      title: seed.title,
      body: writeMeta(seed.body, { due: seed.due, estimate: seed.estimate }),
      state: seed.state ?? 'open',
      labels: labels.map((name) => ({ name })),
      assignees: seed.assignees.map((login) => ({ login })),
      milestone: milestone
        ? {
            number: milestone.number,
            title: milestone.title,
            description: milestone.description,
            due_on: milestone.dueOn ? `${milestone.dueOn}T12:00:00Z` : null,
            open_issues: milestone.openIssues,
            closed_issues: milestone.closedIssues,
            state: milestone.state,
          }
        : null,
      comments: number === 1 ? 1 : 0,
      created_at: new Date(Date.now() - number * 3_600_000).toISOString(),
      updated_at: new Date(Date.now() - number * 1_800_000).toISOString(),
      user: { login: number % 2 ? ME : PARTNER },
      html_url: `https://github.com/mock/workspace/issues/${number}`,
    });
  }

  /** Pretend the network takes a moment, so loading states are visible. */
  private async delay<T>(value: T): Promise<T> {
    this.stats.requests++;
    this.rateLimit = { ...this.rateLimit, remaining: this.rateLimit.remaining - 1 };
    this.onStateChange?.();
    await new Promise((r) => setTimeout(r, 120));
    return value;
  }

  async getViewer(): Promise<ViewerInfo | null> {
    return this.delay({
      login: ME,
      name: 'Demo user',
      avatarUrl: avatar(ME),
      tokenExpiresAt: this.tokenExpiresAt,
    });
  }

  async checkRepoAccess() {
    return this.delay({ ok: true } as const);
  }

  viewerFromMember(member: Member): ViewerInfo {
    return {
      login: member.login,
      name: member.name ?? member.login,
      avatarUrl: member.avatarUrl,
      tokenExpiresAt: this.tokenExpiresAt,
    };
  }

  async getMembers(): Promise<Member[]> {
    return this.delay([
      { login: ME, avatarUrl: avatar(ME), name: 'Demo user' },
      { login: PARTNER, avatarUrl: avatar(PARTNER), name: 'Your partner' },
    ]);
  }

  async ensureLabels(): Promise<string[]> {
    return this.delay([]);
  }

  async listLabels(): Promise<string[]> {
    return this.delay([...this.labels]);
  }

  async ensureClientLabel(name: string): Promise<void> {
    this.labels.add(name);
    await this.delay(null);
  }

  async listTasks(): Promise<{ tasks: Task[]; fresh: boolean }> {
    return this.delay({ tasks: [...this.tasks], fresh: true });
  }

  async getTask(number: number): Promise<Task> {
    const found = this.tasks.find((t) => t.number === number);
    if (!found) throw new Error(`No task #${number}`);
    return this.delay({ ...found });
  }

  async createTask(input: {
    title: string;
    body: string;
    labels: string[];
    assignees: string[];
    milestone?: number | null;
  }): Promise<Task> {
    const milestone = MILESTONES.find((m) => m.number === input.milestone) ?? null;
    const task = toTask({
      number: this.nextNumber++,
      title: input.title,
      body: input.body,
      state: 'open',
      labels: input.labels.map((name) => ({ name })),
      assignees: input.assignees.map((login) => ({ login })),
      milestone: milestone
        ? {
            number: milestone.number,
            title: milestone.title,
            description: milestone.description,
            due_on: milestone.dueOn ? `${milestone.dueOn}T12:00:00Z` : null,
            open_issues: milestone.openIssues,
            closed_issues: milestone.closedIssues,
            state: milestone.state,
          }
        : null,
      comments: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user: { login: ME },
      html_url: '#',
    });
    this.tasks.unshift(task);
    return this.delay(task);
  }

  async updateTask(number: number, patch: Record<string, unknown>): Promise<Task> {
    const index = this.tasks.findIndex((t) => t.number === number);
    if (index < 0) throw new Error(`No task #${number}`);
    const current = this.tasks[index];
    const labels = (patch.labels as string[] | undefined) ?? [
      `status: ${current.status}`,
      ...(current.priority ? [`priority: ${current.priority}`] : []),
      ...(current.client ? [`client: ${current.client}`] : []),
      ...current.otherLabels,
    ];
    const milestoneNumber = 'milestone' in patch ? (patch.milestone as number | null) : current.milestone?.number ?? null;
    const milestone = MILESTONES.find((m) => m.number === milestoneNumber) ?? null;
    const next = toTask({
      number,
      title: (patch.title as string) ?? current.title,
      body: (patch.body as string) ?? current.rawBody,
      state: (patch.state as 'open' | 'closed') ?? current.state,
      labels: labels.map((name) => ({ name })),
      assignees: ((patch.assignees as string[]) ?? current.assignees).map((login) => ({ login })),
      milestone: milestone
        ? {
            number: milestone.number,
            title: milestone.title,
            description: milestone.description,
            due_on: milestone.dueOn ? `${milestone.dueOn}T12:00:00Z` : null,
            open_issues: milestone.openIssues,
            closed_issues: milestone.closedIssues,
            state: milestone.state,
          }
        : null,
      comments: current.comments,
      created_at: current.createdAt,
      updated_at: new Date().toISOString(),
      user: { login: current.author },
      html_url: current.htmlUrl,
    });
    this.tasks[index] = next;
    return this.delay(next);
  }

  async listComments(number: number): Promise<Comment[]> {
    return this.delay(this.comments.get(number) ?? []);
  }

  async addComment(number: number, body: string): Promise<Comment> {
    const comment: Comment = {
      id: Date.now(),
      author: ME,
      avatarUrl: avatar(ME),
      body,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.comments.set(number, [...(this.comments.get(number) ?? []), comment]);
    const index = this.tasks.findIndex((t) => t.number === number);
    if (index >= 0) this.tasks[index] = { ...this.tasks[index], comments: this.tasks[index].comments + 1 };
    return this.delay(comment);
  }

  async listProjects(): Promise<Project[]> {
    // Recount from the live task list so the progress bars move as you work.
    const counted = MILESTONES.map((m) => ({
      ...m,
      openIssues: this.tasks.filter((t) => t.milestone?.number === m.number && t.state === 'open').length,
      closedIssues: this.tasks.filter((t) => t.milestone?.number === m.number && t.state === 'closed').length,
    }));
    return this.delay(counted);
  }

  async createProject(title: string, dueOn: string | null, description: string): Promise<Project> {
    const project: Project = {
      number: MILESTONES.length + 1,
      title,
      description,
      dueOn,
      openIssues: 0,
      closedIssues: 0,
      state: 'open',
    };
    MILESTONES.push(project);
    return this.delay(project);
  }

  async updateProject(
    number: number,
    patch: { title?: string; dueOn?: string | null; description?: string; state?: 'open' | 'closed' },
  ): Promise<Project> {
    const index = MILESTONES.findIndex((m) => m.number === number);
    if (index < 0) throw new Error(`No project ${number}`);
    const next: Project = {
      ...MILESTONES[index],
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.state !== undefined ? { state: patch.state } : {}),
      ...(patch.dueOn !== undefined ? { dueOn: patch.dueOn } : {}),
    };
    MILESTONES[index] = next;
    return this.delay(next);
  }

  async deleteProject(number: number): Promise<void> {
    const index = MILESTONES.findIndex((m) => m.number === number);
    if (index >= 0) MILESTONES.splice(index, 1);
    // The tasks survive; they just lose their project, same as on GitHub.
    this.tasks = this.tasks.map((t) =>
      t.milestone?.number === number ? { ...t, milestone: null } : t,
    );
    await this.delay(null);
  }

  async listActivity(): Promise<ActivityItem[]> {
    const items: ActivityItem[] = this.tasks.slice(0, 10).map((t, i) => ({
      id: `m${t.number}`,
      kind: 'event',
      verb: t.state === 'closed' ? 'closed' : 'labeled',
      actor: i % 2 ? PARTNER : ME,
      avatarUrl: avatar(i % 2 ? PARTNER : ME),
      issueNumber: t.number,
      issueTitle: t.title,
      at: t.updatedAt,
      detail: `status: ${t.status}`,
    }));
    return this.delay(items.sort((a, b) => b.at.localeCompare(a.at)));
  }
}
