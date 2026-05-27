# AGENTS.md

**Read this file first if you are an agent (or human) starting work in this repo.** It is the entry point: where to look, what's mandatory, what NOT to do. Detailed conventions live in [.claude/CLAUDE.md](.claude/CLAUDE.md); this file is the short orientation.

This file is also the cross-tool convention (Codex CLI, Cursor, etc.) — agents that don't read `CLAUDE.md` will read this.

---

## Before working (compulsory)

Do these in order, every time, before you touch a file:

1. **Read [.claude/CLAUDE.md](.claude/CLAUDE.md)** — branch strategy, release workflow, coding style, what-not-to-do, ASO rules, GitHub label rules.
2. **Read [.claude/SKILLS.md](.claude/SKILLS.md)** — the agent → skills matrix. Know which skills your subagent loads.
3. **Run `git status` and `git log --oneline -5`** — never edit on top of uncommitted local changes you don't understand. Warn the user if you find any.
4. **Branch off `dev`, not `main`.** Use the prefix-naming convention (`feat/*`, `fix/*`, `refactor/*`, `docs/*`, `chore/*`, `test/*`).
5. **If the task is non-trivial**, write a short plan or ask a clarifying question via `AskUserQuestion` BEFORE editing.

Skipping any of these is the most common cause of broken PRs in this repo.

---

## Map of the repo

```
focal-studio-app-template/
├── AGENTS.md              ← you are here
├── README.md              ← human-facing setup + run instructions
├── CHANGELOG.md           ← user-visible changes; update under [Unreleased] for any change
├── package.json           ← scripts: start, ios, android, test, lint, type-check, bump-version
├── app.json               ← Expo config; native fields here invalidate EAS build cache
├── tsconfig.json
│
├── app/                   ← Expo Router screens (file-based routing)
│   ├── (auth)/            ← unauthenticated screens (login, signup)
│   ├── (tabs)/            ← main app tabs (+ _layout.tsx defines tab bar)
│   ├── onboarding.tsx
│   └── paywall.tsx
│
├── src/
│   ├── components/        ← shared UI components
│   ├── store/             ← Zustand stores (one file per domain: auth, onboarding, paywall…)
│   ├── services/          ← third-party SDK wrappers (Supabase, RevenueCat, PostHog…) — CREATE if missing
│   ├── theme/             ← design tokens. NEVER hardcode color/spacing/typography — import from here
│   ├── utils/
│   │   └── storage.ts     ← AsyncStorage helpers; ALWAYS use these, never raw AsyncStorage
│   └── constants.ts       ← DEV_MODE_KEY lives here; bump on every release
│
├── scripts/
│   └── bump-version.sh    ← updates package.json + app.json in one shot
│
├── store-listing/         ← App Store / Play Store metadata (created on first ASO refresh)
│
├── .github/workflows/     ← CI: release.yml auto-tags on merge to main
│
└── .claude/
    ├── CLAUDE.md          ← FULL project instructions (read this!)
    ├── SKILLS.md          ← agent → skills matrix
    ├── agents/            ← 5 specialist subagents (see below)
    └── skills/            ← 18 vendored skill packs (ship with the template, no per-machine install)
```

### Key files an agent will touch most often

| Want to… | Edit |
|---|---|
| Add a screen | `app/<name>.tsx` (and `app/(tabs)/_layout.tsx` if it's a tab) |
| Add or extend a store | `src/store/use<Name>Store.ts` |
| Wire a third-party SDK | `src/services/<name>.ts` + a store in `src/store/` |
| Change theming | `src/theme/` (then use `useTheme()` everywhere) |
| Persist data | `src/utils/storage.ts` helpers — never `AsyncStorage.*` directly |
| Cut a release | invoke `release-manager` subagent — do not do this by hand |

---

## Agent registry

Six specialist subagents live in [.claude/agents/](.claude/agents/). The main Claude Code session (Opus) is the orchestrator — it delegates, it does not do all the work itself.

| Subagent | Use for |
|---|---|
| [`ios-frontend`](.claude/agents/ios-frontend.md) | React Native + Expo UI work: screens, components, theming, navigation, animation |
| [`backend-integrator`](.claude/agents/backend-integrator.md) | Wiring Supabase, RevenueCat, PostHog, expo-notifications, AsyncStorage |
| [`release-manager`](.claude/agents/release-manager.md) | Cut a release — runs the full release workflow from `.claude/CLAUDE.md` |
| [`aso-marketing`](.claude/agents/aso-marketing.md) | App Store / Google Play listing copy with hard char-limit enforcement |
| [`qa-reviewer`](.claude/agents/qa-reviewer.md) | Read-only pre-PR review — async bugs, cleanup gaps, security, supply chain |
| [`devops-agent`](.claude/agents/devops-agent.md) | Package risk assessment + controlled installation. **Never auto-spawned** — see Dependency Gate below |

Each agent declares the skills it loads — see [.claude/SKILLS.md](.claude/SKILLS.md) for the matrix.

**Long-report handoff.** If a subagent's report would exceed ~80 lines, it writes the full report to `.claude/scratch/<agent>-<YYYYMMDD-HHMM>.md` and returns only the path plus a 3-bullet summary. Keeps the orchestrator context lean. Full convention in [.claude/CLAUDE.md](.claude/CLAUDE.md) under "Multi-agent workflow".

### When to delegate vs do it yourself

- **Single trivial edit** (typo, one-line fix, rename) → do it yourself. Spawning a subagent adds a roundtrip without benefit.
- **Anything that fits an agent's role** → delegate. Pass a self-contained brief (file paths, expected behavior, what to return). Don't make the subagent re-derive the plan.
- **Mixed-domain request** → decompose into independent subtasks and spawn subagents in **parallel** (single message, multiple `Agent` tool calls).

---

## Dependency Gate

Every task that requires new npm packages goes through the **Dependency Gate** before any code is written. This ensures the user reviews all installation risks upfront — so the coding workflow runs completely uninterrupted after approval.

### Flow

```
Orchestrator: identify packages the task needs (not in package.json)
    │
    ├─ Packages needed? ──YES──► spawn devops-agent (pre-flight mode)
    │                                │
    │                                ▼
    │                        Risk report (🟢/🟡/🔴 per package)
    │                                │
    │                        User: Approve / Reject / Substitute
    │                                │
    │                        devops-agent installs approved packages
    │                                │
    └─ No packages / post-approval ──► spawn coding subagent(s)
                                              │
                           [Mid-run: unexpected package discovered]
                                              │
                           Subagent STOPS → returns PACKAGES_NEEDED block
                           Orchestrator gates through devops-agent again
                           User approves → subagent resumes
```

### PACKAGES_NEEDED — the stop signal

When `backend-integrator` or `ios-frontend` discovers a missing package mid-run, they return:

```
PACKAGES_NEEDED:
  - package: @supabase/supabase-js
    reason: Supabase JS client for auth and database
STATUS: awaiting_approval
```

The orchestrator reads this, forwards to `devops-agent`, and resumes the coding agent after the receipt arrives.

### Why this design

| Alternative | Problem |
|---|---|
| Subagent auto-installs mid-run | Bypasses risk review; breaks user's "inspect upfront" expectation |
| Orchestrator asks user each time | Interrupts coding context; multiple back-and-forths |
| Pre-flight gate (this design) | User sees all risks before work starts; rest of workflow is uninterrupted |

---

## Top mistakes to avoid

1. **Editing on `main` or `dev` directly.** Always branch first.
2. **Hardcoding colors, spacing, or font sizes.** Use `useTheme()` and tokens in `src/theme/`.
3. **Calling `AsyncStorage.getItem/setItem` directly.** Use `src/utils/storage.ts` — there was a null-handling bug (commit `825e87b`) the helpers paper over.
4. **Adding a native module config plugin without flagging it.** It invalidates the EAS build cache. Surface this in your report.
5. **Putting keyboard input inside a modal.** iOS layout shifts. Use pickers/toggles.
6. **Merging the release PR with `--delete-branch`.** Auto-closes the dev backmerge PR. Use `gh pr merge NNN --merge` only.
7. **Letting a subagent open PRs.** Subagents return reports; the orchestrator handles git/PR.
8. **Skipping `CHANGELOG.md` for user-visible changes.** Always update under `## [Unreleased]`.
9. **Installing npm packages without going through `devops-agent`.** Always run the Dependency Gate — even for "harmless" packages. The user decides, not the agent.

---

## Output format the user expects from you

For most tasks, structure your response as:

1. **Plan** — one short paragraph or bullets.
2. **Branch name** — the branch you will create or use.
3. **Files to change** — short list.
4. **Implementation notes** — concise.
5. **Test steps** — concrete local checks.
6. **Commit message** — one suggested message.

---

## Where to find more

- Full conventions, release workflow, ASO rules, GitHub labels → [.claude/CLAUDE.md](.claude/CLAUDE.md)
- Agent → skills matrix → [.claude/SKILLS.md](.claude/SKILLS.md)
- Individual agent specs → [.claude/agents/](.claude/agents/)
- Setup, local run instructions → [README.md](README.md)