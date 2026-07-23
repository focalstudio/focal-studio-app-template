---
description: End-of-session wrap-up — keep STATUS.md and ROADMAP.md fresh
---

You are closing out a [APP_NAME] work session. Goal: leave the tracking files
accurate so the next `/standup` is correct. This is the habit that stops the
whole system from drifting — do it before stopping for the day.

## 1. Figure out what happened this session

- `git log --oneline origin/dev..HEAD` (commits made on this branch) and `git status -s`
- `/opt/homebrew/bin/gh pr status` to see if anything was opened/merged (skip if gh unavailable)
- Skim the diff if needed to understand what actually shipped vs. what was just started.

## 2. Update ROADMAP.md (the progress source of truth)

- Check off (`- [x]`) any substage that **actually shipped** — merged to `dev` or released.
  Work that was only started stays unchecked.
- If new in-scope work appeared, add it as a `- [ ]` under the right phase (tag the
  issue number if there is one). Don't invent phases.

## 3. Update STATUS.md (the "now" file)

- Refresh the **Version** / **Stage** line and the `_Updated:_` date (use today's date).
- Rewrite **Now** to one line describing the current state of play.
- Replace **Next** with the 2–3 most important things for next session.
- Update **Blockers** (or "None").

## 4. CHANGELOG reminder

If a user-visible change shipped this session and it isn't already in
`CHANGELOG.md` under `## [Unreleased]`, point it out (per project rules, every
user-visible change goes there) — but only add it if I confirm.

## 5. Summarise

Print a short recap: what shipped, what moved on the roadmap, and the new
Next list. Then show the updated progress (you may reuse the `/standup` bar logic).

Only edit `STATUS.md` and `ROADMAP.md` (and `CHANGELOG.md` if I confirm). Do not
commit unless I ask.
