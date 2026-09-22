# Parallel sessions: use a worktree, never a shared checkout

> Extracted from `.claude/CLAUDE.md` to keep the always-loaded instructions small.
> Read this file before starting a second session against this repo, or when a branch or
> `HEAD` has moved unexpectedly under you.

---

If more than one Claude Code session (or a session running alongside your own manual work)
will touch this repo at the same time, **each one gets its own `git worktree`, never the same
checkout.** Two sessions sharing one working directory can silently step on each other:

- `git checkout <branch>` in one session moves the *other* session's `HEAD` out from under it.
  A commit made right after looks like it landed on the branch you intended — it actually lands
  on whatever the other session most recently checked out.
- A PR left conflicting against its base (from either session's changes) makes GitHub silently
  skip **every `pull_request`-triggered workflow** for that PR — `mergeable` flips to
  `CONFLICTING`, and CI shows green only because the one check still reporting is a
  `push`-triggered one. It reads as "tests pass" when most of the suite never ran.

Both of the above happened in the same session on this repo and cost real time to untangle —
this rule exists because of that, not hypothetically.

**To set up a worktree:**

```bash
git worktree add ../focal-studio-app-template-<branch> -b <branch> origin/dev
cd ../focal-studio-app-template-<branch>
npm ci --legacy-peer-deps   # each worktree has its own node_modules
```

Each worktree is a full separate directory with its own `HEAD`, so parallel sessions can
`git checkout`, commit, and push independently with no shared mutable state. Remove it once its
branch is merged: `git worktree remove ../focal-studio-app-template-<branch>` from the main
checkout (after `cd` back out of it).

If you notice mid-session that another session's branch or `HEAD` has moved unexpectedly, stop
and check `git reflog` before taking any further action — don't assume the working directory
still reflects what you last left it in.
