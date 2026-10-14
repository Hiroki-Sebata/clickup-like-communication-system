/**
 * The shape the rest of the app talks to. Two things implement it: the real
 * GitHubApi, and the MockApi used by `npm run dev:mock` so you can click through
 * the whole interface without a token or a repository.
 */
import type { ActivityItem, Comment, Member, Project, Task } from './types';
import type { RateLimit, ViewerInfo } from './github';

export interface Api {
  rateLimit: RateLimit;
  tokenExpiresAt: Date | null;
  readonly isBackingOff: boolean;
  readonly backoffUntil: Date | null;
  readonly stats: { requests: number; notModified: number; writes: number };
  onStateChange: (() => void) | null;

  /** null when the token is repo-scoped and cannot read account details. */
  getViewer(): Promise<ViewerInfo | null>;
  viewerFromMember(member: Member): ViewerInfo;
  checkRepoAccess(): Promise<{ ok: true } | { ok: false; reason: string }>;
  getMembers(): Promise<Member[]>;
  ensureLabels(): Promise<string[]>;
  listLabels(): Promise<string[]>;
  ensureClientLabel(name: string): Promise<void>;

  listTasks(): Promise<{ tasks: Task[]; fresh: boolean }>;
  getTask(number: number): Promise<Task>;
  createTask(input: {
    title: string;
    body: string;
    labels: string[];
    assignees: string[];
    milestone?: number | null;
  }): Promise<Task>;
  updateTask(
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
  ): Promise<Task>;

  listComments(number: number): Promise<Comment[]>;
  addComment(number: number, body: string): Promise<Comment>;

  listProjects(): Promise<Project[]>;
  createProject(title: string, dueOn: string | null, description: string): Promise<Project>;
  updateProject(
    number: number,
    patch: { title?: string; dueOn?: string | null; description?: string; state?: 'open' | 'closed' },
  ): Promise<Project>;
  deleteProject(number: number): Promise<void>;

  listActivity(): Promise<ActivityItem[]>;
}
