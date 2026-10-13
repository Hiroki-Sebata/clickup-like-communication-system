/** Shared shapes. Kept deliberately small — these mirror what GitHub gives us. */

export type Status = 'todo' | 'in progress' | 'review' | 'done';
export type Priority = 'urgent' | 'high' | 'normal' | 'low';

export interface Member {
  login: string;
  avatarUrl: string;
  name?: string;
}

/** The hidden <!-- board: {...} --> block we keep at the top of an issue body. */
export interface BoardMeta {
  /** Due date as YYYY-MM-DD. */
  due?: string;
  /** Free text time estimate, e.g. "2h", "3d". */
  estimate?: string;
}

export interface Project {
  number: number;
  title: string;
  description: string | null;
  dueOn: string | null;
  openIssues: number;
  closedIssues: number;
  state: 'open' | 'closed';
}

/** One task = one GitHub Issue. */
export interface Task {
  number: number;
  title: string;
  /** The description WITHOUT the hidden metadata block. */
  body: string;
  /** The raw body exactly as GitHub stores it, metadata block included. */
  rawBody: string;
  state: 'open' | 'closed';
  status: Status;
  priority: Priority | null;
  client: string | null;
  /** Any labels that are not status/priority/client. */
  otherLabels: string[];
  assignees: string[];
  milestone: Project | null;
  meta: BoardMeta;
  comments: number;
  createdAt: string;
  updatedAt: string;
  author: string;
  htmlUrl: string;
}

export interface Comment {
  id: number;
  author: string;
  avatarUrl: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityItem {
  id: string;
  kind: 'comment' | 'event';
  /** e.g. "closed", "labeled", "assigned" */
  verb: string;
  actor: string;
  avatarUrl: string;
  issueNumber: number;
  issueTitle: string;
  at: string;
  detail?: string;
}
