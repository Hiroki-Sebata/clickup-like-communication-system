/**
 * The sign-in regression that cost a lot of time.
 *
 * Board asks you to make a fine-grained token scoped to ONE repository, with no
 * account permissions. GitHub then answers GET /user with 404. The old sign-in
 * used that call as its gate, so it rejected exactly the token it had told you
 * to create. These tests pin the fixed behaviour.
 */
import { describe, it, expect } from 'vitest';
import { GitHubApi } from '../lib/github';

function apiWithStubbedRequest(handler: (route: string) => unknown) {
  const api = new GitHubApi('fake-token');
  // Reach past the public surface to stand in for the network.
  (api as unknown as { octokit: { request: unknown } }).octokit = {
    request: async (route: string) => handler(route),
  };
  return api;
}

/**
 * A plain Error carrying a status, NOT an @octokit/request-error instance.
 *
 * This is the point of these tests. Octokit's bundled plugins can throw an error
 * built from a different copy of RequestError than the app imports, so any
 * `instanceof` check silently fails in the real bundle while passing in a test
 * that constructs the imported class. Throwing a bare object here proves the
 * handling reads .status rather than the class identity.
 */
function httpError(status: number, message: string, headers: Record<string, string> = {}) {
  return Object.assign(new Error(message), {
    status,
    response: { status, headers, data: {} },
  });
}

const notFound = (_route: string) => httpError(404, 'Not Found');

describe('a repo-scoped token (no account permissions)', () => {
  it('returns null from getViewer instead of throwing', async () => {
    const api = apiWithStubbedRequest((route) => {
      if (route === 'GET /user') throw notFound(route);
      return { data: {}, headers: {} };
    });
    await expect(api.getViewer()).resolves.toBeNull();
  });

  it('also returns null on 403, which some tokens give instead', async () => {
    const api = apiWithStubbedRequest((route) => {
      if (route === 'GET /user') throw httpError(403, 'Forbidden');
      return { data: {}, headers: {} };
    });
    await expect(api.getViewer()).resolves.toBeNull();
  });

  it('still reports repository access as fine', async () => {
    const api = apiWithStubbedRequest((route) => {
      if (route === 'GET /user') throw notFound(route);
      return { data: { full_name: 'x/y' }, headers: {} };
    });
    await expect(api.checkRepoAccess()).resolves.toEqual({ ok: true });
  });

  it('builds an identity from a collaborator the person picks', async () => {
    const api = apiWithStubbedRequest(() => ({ data: {}, headers: {} }));
    const viewer = api.viewerFromMember({
      login: 'hiroki',
      avatarUrl: 'https://example.test/a.png',
      name: 'Hiroki',
    });
    expect(viewer.login).toBe('hiroki');
    expect(viewer.name).toBe('Hiroki');
  });
});

describe('a genuinely broken token', () => {
  it('lets a 401 through, because that is a real problem', async () => {
    const api = apiWithStubbedRequest(() => {
      throw httpError(401, 'Bad credentials');
    });
    await expect(api.getViewer()).rejects.toThrow('Bad credentials');
  });

  it('reports a missing repository in words you can act on', async () => {
    const api = apiWithStubbedRequest((route) => {
      throw notFound(route);
    });
    const result = await api.checkRepoAccess();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('token was not given access');
  });
});

describe('request parameters', () => {
  it('does not bolt owner/repo onto account routes', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const api = new GitHubApi('fake-token');
    (api as unknown as { octokit: { request: unknown } }).octokit = {
      request: async (_route: string, params: Record<string, unknown>) => {
        seen.push(params);
        return { data: { login: 'x', name: null, avatar_url: '' }, headers: {} };
      },
    };
    await api.getViewer();
    expect(seen[0]).not.toHaveProperty('owner');
    expect(seen[0]).not.toHaveProperty('repo');
  });

  it('still sends owner/repo on repository routes', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const api = new GitHubApi('fake-token');
    (api as unknown as { octokit: { request: unknown } }).octokit = {
      request: async (_route: string, params: Record<string, unknown>) => {
        seen.push(params);
        return { data: {}, headers: {} };
      },
    };
    await api.checkRepoAccess();
    expect(seen[0]).toHaveProperty('owner');
    expect(seen[0]).toHaveProperty('repo');
  });
});
