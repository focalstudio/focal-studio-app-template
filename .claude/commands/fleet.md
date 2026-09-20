---
description: Fleet-wide briefing — every repo in the org, its database, last release and what's in flight
---

You are giving the **fleet** briefing: not this repo, but every repo in the GitHub org
this checkout belongs to. Use it when picking up work after a gap, before cutting a
release, or any time I ask "what's the state of everything / which app needs attention".

`/standup` is one repo, deep. `/fleet` is every repo, shallow. They answer different
questions and neither replaces the other.

## Run it

```bash
bash scripts/fleet-report.sh
```

That is the whole data-gathering step — **do not re-derive any of it with your own `gh`
calls.** The script queries the GitHub API live, so there is no manifest to check and no
stale inventory to distrust. Useful flags:

- `--repo NAME` — one repo only
- `--releases N` — last N releases with their notes, when I ask "what shipped recently"
- `--write` — also drop the report in `.claude/scratch/` (gitignored)
- `--json` — only when you need to compute something the text output doesn't already say
- `--html` — render the dashboard instead of the table (see below); prints the path it wrote

## The dashboard is usually the better answer

`~/.focalstudio/fleet.html` is the same data as a page, refreshed every 3 hours by a
launchd agent (`bash scripts/install-fleet-agent.sh`). It carries what the terminal
table cannot: a 🔴/🟡/🟢 per repo with the reasons spelled out, and template currency —
which release each app adopted and whether the template has moved past it.

**If the user asks something the dashboard already answers, say so and point at it**
rather than spending a minute of API calls reproducing it in the terminal. Run the
script when they want it in the conversation, when the page is stale, or when they ask
for something it does not show (release notes, per-repo detail).

If `gh` is unauthenticated the script says so and exits; relay that rather than guessing.

## Then interpret

Print the script's output as-is, then add **at most five lines** of your own on top of it.
The table is already the report — your value is the judgement it can't encode:

1. **Lead with the `NEEDS A LOOK` block** if it is non-empty. Say which single item you'd
   act on first and why. Unreleased commits on a store-bound branch and a red CI run
   outrank a stale roadmap bar.
2. **Name anything the script flags but can't explain.** A fleet-wide stack difference,
   an app with no release at all, an app whose `dev` has drifted far from its default
   branch — each is a question, not a verdict.
3. **Connect it to this repo.** If a shared-surface fix here hasn't reached the apps,
   that's `bash scripts/drift-report.sh`, not this command — say so and stop.

Do not restate the table in prose. Do not edit any files. Do not open issues or PRs
without being asked.

End with one sentence naming the repo that most needs attention, or "Fleet is quiet."
