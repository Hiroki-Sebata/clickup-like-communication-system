# Board

A task manager for the two of us. It looks like ClickUp, it installs like an app,
and it has no server and no database behind it.

Every task is a **GitHub Issue** in one private repository. That is the whole
storage system. Nothing else holds your data, nothing else can lose it, and there
is nothing to pay for.

---

## Contents

1. [How it works in one minute](#how-it-works-in-one-minute)
2. [Setting it up the first time](#setting-it-up-the-first-time)
3. [Making your access token](#making-your-access-token)
4. [Installing the app on your computer](#installing-the-app-on-your-computer)
5. [Telegram notifications](#telegram-notifications)
6. [Using Board day to day](#using-board-day-to-day)
7. [Updating the app](#updating-the-app)
8. [If something goes wrong](#if-something-goes-wrong)
9. [For whoever maintains the code](#for-whoever-maintains-the-code)

---

## How it works in one minute

| In Board | In GitHub |
| --- | --- |
| A task | An issue |
| Its description | The issue body (Markdown) |
| Status: To do / In progress / Review / Done | A label, `status: todo` and so on |
| Priority | A label, `priority: high` and so on |
| Client | A label, `client: Acme Dental` |
| Project | A milestone, with its own due date |
| Comments / updates | Issue comments |
| Due date and time estimate | A hidden line at the top of the description |

That hidden line looks like this, and GitHub never shows it to a reader:

```
<!-- board: {"due":"2026-10-20","estimate":"2h"} -->
```

Board reads and rewrites only that line. Your own words in the description are
never touched.

Moving a task to **Done** also closes the issue. Reopening a closed issue puts it
back to **To do**.

---

## Setting it up the first time

You need **two repositories**. One is public and holds the app; one is private and
holds your work.

### 1. The private repository for your tasks

On github.com, click **New repository**.

- Name it `workspace` (or anything you like).
- Set it to **Private**. This matters: your clients' names will be in here.
- Create it.

Then invite the other person: **Settings → Collaborators → Add people**. Board
reads this list to know who you both are, so nobody's username is written into the
public code.

### 2. The public repository for the app

This is the repository you are reading now. If it is not yet where you want it:

- Create a new **public** repository (for example `board`).
- Push this code to it.

### 3. Tell the app where your tasks live

Open **`src/config.ts`** and change the first two lines:

```ts
dataOwner: 'Northbound',   // the account or organisation that owns the private repo
dataRepo:  'workspace',    // the private repo's name
```

Also set `appUrl` to wherever the app will be published, for example
`https://northbound.github.io/board`. Commit and push.

> A GitHub **organisation** (like `Northbound`) can only be created by a person, in
> the GitHub web interface — no tool can make one for you. If you have not made one,
> use your own username as `dataOwner` instead; everything works the same.

### 4. Turn on GitHub Pages

In the **app** repository: **Settings → Pages → Build and deployment → Source** and
choose **GitHub Actions**.

Push to `main`. The workflow in `.github/workflows/deploy.yml` builds the app and
publishes it. Watch it in the **Actions** tab. When it is green, your app is live at:

```
https://<your-account>.github.io/<repo-name>/
```

The address is worked out from the repository name automatically, so you do not
need to configure it anywhere.

### 5. Open it and sign in

Open that address, paste in a token (next section), and Board will create the eight
status and priority labels in your private repository for you. That only happens
once.

---

## Making your access token

Board talks to GitHub as **you**, using a token you create. You will each make your
own, on each computer you use.

1. Go to github.com, click your photo (top right) → **Settings**.
2. Scroll to the bottom of the left menu → **Developer settings**.
3. **Personal access tokens → Fine-grained tokens → Generate new token**.
4. Fill it in:
   - **Token name**: something you will recognise, like `Board on my MacBook`.
   - **Expiration**: 90 days is a sensible choice. Board will warn you in the top
     bar when it has 14 days left.
   - **Resource owner**: the account that owns your private repository.
   - **Repository access**: **Only select repositories** → pick your private repo.
   - **Permissions → Repository permissions**:
     - **Issues**: **Read and write**
     - **Metadata**: **Read-only** (GitHub ticks this for you)
     - Leave everything else alone.
5. **Generate token**, then copy it. GitHub shows it once and never again.
6. Paste it into Board and press **Sign in**.

### Where the token is kept

In your browser's local storage, on that one computer. There is no server in this
app, so there is nowhere else it could go. The only place Board sends it is
github.com.

To remove it: the **Sign out and forget token** button at the bottom of the
sidebar. That clears the token and the saved copy of your tasks from that browser.

### Why a fine-grained token

A fine-grained token can be locked to one repository and two permissions. If it
ever leaked, the damage is limited to the issues in that one private repo. A
classic token cannot be limited that way, so do not use one.

---

## Installing the app on your computer

Board is a Progressive Web App: a website that installs like a normal program, with
its own icon and its own window, no browser tabs or address bar.

### macOS (Apple Silicon or Intel) — Chrome

1. Open your Board address in Chrome.
2. In the address bar, on the right, there is a small **install icon** (a monitor
   with an arrow). Click it.
   - No icon? Use the **⋮** menu → **Cast, save and share → Install page as app**.
3. Click **Install**. Board appears in Launchpad and in your Applications folder,
   and you can keep it in the Dock.

### macOS — Edge

1. Open your Board address in Edge.
2. **…** menu → **Apps → Install this site as an app**.
3. **Install**.

### Windows — Chrome or Edge

1. Open your Board address.
2. Chrome: the **install icon** in the address bar, or **⋮ → Cast, save and share →
   Install page as app**.
   Edge: **… → Apps → Install this site as an app**.
3. **Install**. It appears in the Start menu, and you can pin it to the taskbar.

### Removing it

Open the installed app, click the **⋮** in its own window, choose **Uninstall**.

### Offline

If you lose your connection, Board still opens and shows the tasks it last loaded,
with an **Offline** badge in the sidebar. You cannot change anything until you are
back online — a change nobody can save is worse than no change.

---

## Telegram notifications

Two workflows live in the **private data repository**, not in the app. They are in
the `workspace-workflows/` folder here, ready to copy across.

### 1. Make the bot

1. In Telegram, start a chat with **@BotFather**.
2. Send `/newbot`, give it a name and a username ending in `bot`.
3. BotFather replies with a long **token**. Keep it.

### 2. Find your chat id

If you want messages in a group with both of you:

1. Make the group and add your bot to it.
2. Send any message in the group.
3. Open this in a browser, with your token in place of `<TOKEN>`:
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Look for `"chat":{"id":-1001234567890`. That number, **minus sign included**, is
   your chat id.

For messages to just yourself, message the bot directly and do the same.

### 3. Put the secrets in the private repository

In the **private** repository: **Settings → Secrets and variables → Actions**.

On the **Secrets** tab, **New repository secret**, twice:

| Name | Value |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | the token from BotFather |
| `TELEGRAM_CHAT_ID` | the chat id, minus sign included |

On the **Variables** tab, **New repository variable**:

| Name | Value |
| --- | --- |
| `BOARD_URL` | your app address, no trailing slash, e.g. `https://northbound.github.io/board` |

That variable is what makes the link in each message open the task in Board rather
than on github.com.

### 4. Copy the two workflow files

Copy `workspace-workflows/telegram.yml` and `workspace-workflows/daily_digest.yml`
into `.github/workflows/` in the **private** repository, and commit.

### What you will get

**When something happens** (`telegram.yml`):

```
partner moved #12: Homepage hero copy
Status: review
https://northbound.github.io/board/#/task/12
```

It fires on: task created, assigned, status changed, closed, reopened, and new
comments. It deliberately ignores priority and client label changes — those are not
worth a buzz.

**Every morning at 08:45 Warsaw time** (`daily_digest.yml`):

```
Good morning. Here is today, 2026-10-13.

OVERDUE (2):
  hiroki:
    #1 Homepage hero copy (due 2026-10-09)
  partner:
    #5 Renew the domain (due 2026-10-01)

DUE TODAY (1):
  hiroki:
    #2 Booking form validation (due 2026-10-13)

NOBODY PICKED UP (2):
    #4 Set up analytics
    #6 Invoice template
```

#### About the 08:45

GitHub's scheduler only understands UTC, and Warsaw is one hour ahead of UTC in
winter and two hours ahead in summer. So 08:45 Warsaw is 07:45 UTC for part of the
year and 06:45 UTC for the rest.

Rather than pick one and be an hour out for half the year, the workflow is
scheduled at **both** times and the first step checks the actual Warsaw clock,
stopping immediately unless it really is 08:45 there. The run that stops takes
about five seconds.

To test it without waiting for the morning: the private repo's **Actions** tab →
**Daily digest** → **Run workflow**. A manual run always sends, whatever the time.

> GitHub's scheduler is "best effort" and can be a few minutes late when its
> servers are busy. This is normal and is not something Board can fix.

---

## Using Board day to day

### The screens

| Key | Screen | What it is for |
| --- | --- | --- |
| `1` | **My Work** | What needs you now: overdue, today, this week, waiting on your review, unclaimed, and what changed since you last looked. |
| `2` | **Board** | Kanban columns. Drag a card between columns to change its status. |
| `3` | **List** | A table. Click a column heading to sort by it. |
| `4` | **Calendar** | Month or week, by due date. Drag a task to another day to move its deadline. |
| `5` | **Projects** | Each milestone with a progress bar and due date. |
| | **Activity** | Everything that has happened lately, newest first. |

### Keyboard

| Key | Does |
| --- | --- |
| `N` | New task |
| `/` | Jump to the search box |
| `1`–`5` | Switch screens |
| `R` | Refresh now |
| `Esc` | Close the panel or dialog you are in |
| `Ctrl`/`Cmd` + `Enter` | Post the update you are writing |

### Filters live in the address

Filter the board by client and assignee and the address becomes something like
`#/board?client=Acme%20Dental&assignee=me`. Bookmark it, or paste it to the other
person and they see exactly the same view.

### When you both edit the same task

Board checks before it saves. If the other person changed the same field while you
had the task open, it stops and shows you both versions, field by field, and you
choose. If they changed a *different* field, both changes are kept and nobody is
interrupted.

### The API counter in the top bar

GitHub allows 5,000 requests an hour. The small `API` pill shows what is left.

Board checks for changes every 30 seconds while the window is in front, and every 5
minutes when it is not — but it uses *conditional requests*. It tells GitHub "only
answer if something changed since last time", and the "nothing changed" reply costs
nothing against your limit. In ordinary use you will sit near 5,000 all day.

If GitHub ever does ask Board to slow down, it waits exactly as long as it is told
and the top bar shows until when.

---

## Updating the app

1. Pull the new code and push it to `main` in the app repository.
2. The Actions workflow builds and publishes it, usually in about a minute.
3. The next time you open Board it updates itself.

If an installed app looks stale: close it completely and reopen it. If it is still
stale, open the same address in a normal browser tab and press
`Ctrl`/`Cmd` + `Shift` + `R`.

---

## If something goes wrong

**"Cannot see Northbound/workspace."**
Either the name in `src/config.ts` is wrong, or your token was not given access to
that repository. Make a new token and check **Resource owner** and **Repository
access**.

**"GitHub did not accept that token."**
Most often the token has expired. Make a new one and sign in again.

**The top bar says the token expires soon.**
Make a new token, press **Sign out and forget token**, and sign in with the new one.

**Labels are missing.**
Board creates them on first launch, but only if your token has **Issues: Read and
write**. Check the permission, then reload.

**Telegram is silent.**
Look at the **Actions** tab in the *private* repository. A red run tells you why.
The usual cause is a mistyped chat id — a group's id starts with a minus sign and
the minus is part of it.

**No members appear in the assignee list.**
Board reads the collaborator list of the private repository. Make sure the other
person has been added under **Settings → Collaborators**, and that they accepted.

---

## For whoever maintains the code

### Running it locally

```bash
npm install
npm run dev:mock   # the whole app with invented tasks, no token needed
npm run dev        # against the real repository in src/config.ts
```

`dev:mock` is the fastest way to see a change, and it is safe to demonstrate to
someone because no real client names are in it.

### Checks

```bash
npm run typecheck  # TypeScript
npm test           # unit tests
npm run build      # production build
```

The deploy workflow runs all three before publishing, so a broken build never
reaches the live site.

### What is tested

91 unit tests across five files, covering the parts where a quiet bug would corrupt
real data or leak your token:

| File | Covers |
| --- | --- |
| `src/tests/metadata.test.ts` | Reading and writing the hidden `<!-- board: … -->` block: broken JSON, blocks not at the top, markdown containing braces, and the round trip that must leave the description byte-for-byte identical. |
| `src/tests/labels.test.ts` | Status transitions: moving to done closes the issue, moving out reopens it, two status labels never coexist, and priority/client/other labels survive every move. |
| `src/tests/dates.test.ts` | The Home screen's buckets, including week boundaries, daylight-saving changes, and the local-vs-UTC day trap. |
| `src/tests/conflict.test.ts` | Detecting a genuine clash and ignoring a false one (same change made twice, reordered assignees, a field the other person did not touch). |
| `src/tests/markdown.test.ts` | Sixteen attempts to smuggle a script into a task description — tags, event handlers, `javascript:` links, data URLs, broken-up tags — each one checked to come out inert, while ordinary markdown still renders. |

### Layout

```
src/
  config.ts            the only file with repository names in it
  lib/
    metadata.ts        the hidden due-date block
    labels.ts          status / priority / client labels and transitions
    dates.ts           due-date grouping
    conflict.ts        three-way comparison
    github.ts          Octokit, ETags, rate limit, back-off
    mock.ts            the fake GitHub used by dev:mock
    markdown.ts        marked + DOMPurify
    router.ts          the hash router
    storage.ts         everything kept on the device
  state/store.tsx      the workspace, polling, optimistic saves
  components/          shell, task panel, dialogs, shared pieces
  screens/             the six screens
  tests/               the unit tests
.github/workflows/     builds and publishes this app
workspace-workflows/   copy these into the PRIVATE repo
```

### A note on security

The app is public and your token sits in the same browser. That makes one thing
important: a task description is written by a person, and if a `<script>` in a
description ever ran, it could read the token.

So everything written by a human goes through `renderMarkdown` in
`src/lib/markdown.ts`, which sanitises with DOMPurify, and that is the only place
in the whole app allowed to set HTML. `@mentions` are highlighted by walking text
nodes afterwards, never by patching the HTML string. If you add a feature that
displays text from GitHub, display it as plain text or send it through that one
function.

The two GitHub workflows follow the same rule for the shell: every value from an
event is passed through the environment, never pasted into the script with `${{ }}`,
so a task titled `"; rm -rf /` is just an odd title.
