/**
 * First launch: ask for a token, check it works, show who it belongs to.
 *
 * The token is stored in localStorage on this device and nowhere else. There is no
 * server in this app, so there is nowhere else it could go.
 */
import { useState } from 'react';
import { config, dataRepoFullName, isMockMode } from '../config';
import { GitHubApi, type ViewerInfo } from '../lib/github';
import { MockApi } from '../lib/mock';
import { storage } from '../lib/storage';

export function SignIn({ onSignedIn }: { onSignedIn: (token: string, viewer: ViewerInfo) => void }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ViewerInfo | null>(null);

  async function check(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setPreview(null);

    try {
      const api = isMockMode ? new MockApi() : new GitHubApi(token.trim());
      const viewer = await api.getViewer();
      const access = await api.checkRepoAccess();
      if (!access.ok) {
        setError(access.reason);
        setPreview(viewer); // we still know who they are, which helps them debug
        setBusy(false);
        return;
      }
      storage.setToken(token.trim());
      onSignedIn(token.trim(), viewer);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = (err as { status?: number })?.status;

      // GitHub's own wording here is unhelpful ("Not Found" when the real problem
      // is a missing permission), so each case gets an answer you can act on.
      let friendly: string;
      if (status === 401 || message.includes('Bad credentials')) {
        friendly =
          'GitHub did not accept that token. Either it was not copied in full, or it has expired. Make a new one.';
      } else if (status === 404 || message.includes('Not Found')) {
        friendly =
          'The token works, but it is not allowed to see who you are. This almost always means the ' +
          'token was created with "Public repositories" access and no permissions. Edit the token: set ' +
          'Repository access to "Only select repositories", pick your tasks repository, then under ' +
          'Repository permissions set Issues to "Read and write" (Metadata ticks itself).';
      } else if (status === 403) {
        friendly =
          'GitHub refused the request. The token is missing a permission, or you have made too many ' +
          'requests and need to wait a few minutes.';
      } else {
        friendly = `Could not reach GitHub: ${message}`;
      }
      setError(friendly);
      setBusy(false);
    }
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

        <button className="btn btn-primary" type="submit" disabled={busy || !token.trim()}>
          {busy ? 'Checking…' : 'Sign in'}
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
