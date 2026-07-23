---
description: Session-start briefing — where the project stands and how much roadmap is left
---

You are giving the [APP_NAME] daily stand-up. Goal: in one screen, tell me exactly
where we are and how much is left, with **live progress bars**. Everything you can
derive from git/files you derive — do NOT trust anything hand-written except the
Now/Next/Blockers in `STATUS.md`.

## Gather (all read-only — run in parallel where possible)

1. `git branch --show-current`, `git log --oneline -8`, `git status -s`
2. Open PRs: `/opt/homebrew/bin/gh pr list` and `/opt/homebrew/bin/gh pr status` (skip gracefully if gh is unavailable)
3. Read `STATUS.md` (Now / Next / Blockers)
4. Read `ROADMAP.md` (the phases + checkboxes)
5. Read the top of `CHANGELOG.md` — the `[Unreleased]` block and the latest released version
6. Read the project's Claude memory for any pending hand-off: the memory index (`MEMORY.md`)
   and any `project_*.md` hand-off files under the project memory dir, if present. Skip
   gracefully if absent.

## Compute the progress bars from ROADMAP.md

For each `## Phase` heading, count `- [x]` (done) vs total `- [ ]`+`- [x]` (substages).
- `percent = round(done / total * 100)`
- Bar is 20 chars wide: `filled = round(percent/5)` `=` characters, then `.` for the rest.
- Status word: `100%` → `done`; the first phase under 100% → `active`; the rest → `todo`.
- Also compute an **OVERALL** bar = total checked boxes across all phases / total boxes.

Render like this (align the bars in a monospace column):

```
[APP_NAME] Roadmap  ·  v<version from package.json>

P1 Public Launch         ====================  100%  done
P2 Retention & First Win =...................    6%  active
P3 Content & Engagement  ....................    0%  todo
P4 Growth & Platform     ....................    0%  todo
------------------------------------------------------------
OVERALL                  ====................   21%
```

(Numbers above are illustrative of the current state — always recompute from the file.)

## Then print the briefing

```
Version   : <package.json version>  (latest released: <CHANGELOG latest>)
Branch    : <current branch>  (<n> uncommitted files)
In flight : <one line — the [Unreleased] CHANGELOG summary / current branch intent>
Open PRs  : <list, or "none">
Next up   : <the Next items from STATUS.md>
Blockers  : <from STATUS.md, or "none">
```

End with a single sentence: **"You are here: <phase name>, ~<overall>% through the roadmap — <one-line what to do next>."**

Keep it tight — this is a glance, not a report. Do not edit any files.
