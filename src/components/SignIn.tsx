/**
 * First launch: ask for a token, check it works, show who it belongs to.
 *
 * The token is stored in localStorage on this device and nowhere else. There is no
 * server in this app, so there is nowhere else it could go.
 */
import { useState } from 'react';
import { config, dataRepoFullName, isMockMode } from '../config';
import { GitHubApi, type ViewerInfo } from '../lib/github';
import type { Api } from '../lib/api';
import { MockApi } from '../lib/mock';
import { storage } from '../lib/storage';
import type { Member } from '../lib/types';

export function SignIn({ onSignedIn }: { onSignedIn: (token: string, viewer: ViewerInfo) => void }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ViewerInfo | null>(null);
  // Shown when the token works but cannot tell us who you are.
  const [choices, setChoices] = useState<Member[] | null>(null);
  const [pendingApi, setPendingApi] = useState<Api | null>(null);

  async function check(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setPreview(null);
    setChoices(null);

    const api: Api = isMockMode ? new MockApi() : new GitHubApi(token.trim());

    try {
      // What actually matters is whether this token can reach the tasks
      // repository. That is checked FIRST, because it is the real requirement.
      const access = await api.checkRepoAccess();
      if (!access.ok) {
        setError(access.reason);
        setBusy(false);
        return;
      }

      // Who is it? A repo-scoped token cannot answer this, and that is fine —
      // it is not a reason to refuse a token that reaches the repository.
      const viewer = await api.getViewer();
      if (viewer) {
        storage.setToken(token.trim());
        storage.setIdentity(viewer.login);
        onSignedIn(token.trim(), viewer);
        return;
      }

      // Fall back to asking. The collaborator list comes from the repository
      // itself, so it needs no account access.
      const members = await api.getMembers();
      if (members.length === 0) {
        setError(
          'The token reaches the repository, but nobody is listed as a collaborator on it, ' +
            'so Board cannot tell who you are. Add yourself under Settings → Collaborators ' +
            'in the tasks repository, then try again.',
        );
        setBusy(false);
        return;
      }
      setPendingApi(api);
      setChoices(members);
      setBusy(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = (err as { status?: number })?.status;

      let friendly: string;
      if (status === 401 || message.includes('Bad credentials')) {
        friendly =
          'GitHub did not accept that token. Either it was not copied in full, or it has expired. Make a new one.';
      } else if (status === 403) {
        friendly =
          'GitHub refused the request. The token is missing the Issues permission, or you have ' +
          'made too many requests and need to wait a few minutes.';
      } else {
        friendly = `Could not reach GitHub: ${message}`;
      }
      setError(friendly);
      setBusy(false);
    }
  }

  /** The person picked themselves from the collaborator list. */
  function chooseMember(member: Member) {
    if (!pendingApi) return;
    storage.setToken(token.trim());
    storage.setIdentity(member.login);
    onSignedIn(token.trim(), pendingApi.viewerFromMember(member));
  }

  return (
    <div className="signin-wrap">
      <form className="glass-solid signin" onSubmit={check}>
        <h1>Board</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Tasks for Northbound. Everything lives in the issues of{' '}
          <strong>{dataRepoFullName}</strong>.
        </p>

        {isMockMode ? (
          <p className="chip" style={{ marginBottom: 14 }}>
            Demo mode — no token needed, nothing is saved
          </p>
        ) : null}

        <label htmlFor="token">Your GitHub personal access token</label>
        <input
          id="token"
          type="password"
          value={token}
          autoComplete="off"
          spellCheck={false}
          placeholder={isMockMode ? 'anything at all' : 'github_pat_...'}
          onChange={(e) => setToken(e.target.value)}
        />

        <details style={{ margin: '12px 0' }}>
          <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>
            How do I make one?
          </summary>
          <ol className="faint" style={{ paddingLeft: 18, lineHeight: 1.8 }}>
            <li>
              Go to <code>github.com</code> → your photo → Settings → Developer settings →
              Personal access tokens → <strong>Fine-grained tokens</strong> →{' '}
              <strong>Generate new token</strong>.
            </li>
            <li>Name it something you will recognise, like "Board on my laptop".</li>
            <li>
              Resource owner: <strong>{config.dataOwner}</strong>.
            </li>
            <li>
              Repository access: tick <strong>Only select repositories</strong> — NOT "Public
              repositories" — then choose <strong>{config.dataRepo}</strong> from the list.
            </li>
            <li>
              Open <strong>Permissions → Repository permissions</strong> (not Account
              permissions), find <strong>Issues</strong> and set it to{' '}
              <strong>Read and write</strong>. Metadata ticks itself. Leave the rest alone.
            </li>
            <li>
              <strong>Generate token</strong>, copy it, paste it above. GitHub shows it once.
            </li>
          </ol>
          <p className="faint" style={{ marginTop: 8 }}>
            The two steps people get wrong are 4 and 5. If the repository list is empty at
            step 4, the repository <strong>{config.dataRepo}</strong> does not exist yet —
            create it first, and make it private.
          </p>
        </details>

        {error ? (
          <p className="pill bad" style={{ display: 'block', padding: '9px 12px', marginBottom: 12 }}>
            {error}
          </p>
        ) : null}

        {preview ? (
          <div className="row" style={{ marginBottom: 12 }}>
            <img className="avatar" src={preview.avatarUrl} alt="" width={28} height={28} />
            <span>
              Signed in as <strong>{preview.name ?? preview.login}</strong>
            </span>
          </div>
        ) : null}

        {choices ? (
          <div
            style={{
              border: '1px solid var(--border-soft)',
              borderRadius: 'var(--radius-button)',
              padding: 12,
              marginBottom: 12,
            }}
          >
            <strong style={{ display: 'block', marginBottom: 4 }}>Which one are you?</strong>
            <p className="faint" style={{ marginTop: 0 }}>
              Your token is scoped to {config.dataRepo} only, so it cannot read your GitHub
              profile. That is the correct, safest setup — Board just needs to know which
              of you is signing in.
            </p>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
              {choices.map((m) => (
                <button
                  key={m.login}
                  type="button"
                  className="btn"
                  onClick={() => chooseMember(m)}
                >
                  <img className="avatar" src={m.avatarUrl} alt="" width={20} height={20} />
                  {m.name ?? m.login}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy || !token.trim() || !!choices}
        >
          {busy ? 'Checking…' : choices ? 'Pick your name above' : 'Sign in'}
        </button>

        <p className="faint" style={{ marginBottom: 0, marginTop: 14 }}>
          The token is kept in this browser only. Use "Sign out and forget token" to
          remove it. This app has no server and never sends your token anywhere except
          to GitHub.
        </p>
      </form>
    </div>
  );
}
