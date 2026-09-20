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
├── docs/testing.md        ← Jest harness: how to render a screen in a test
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
│   └── constants.ts       ← APP_VERSION + DEV_MODE_KEY, derived from package.json; never edit by hand
│
├── scripts/
│   ├── bump-version.sh    ← updates package.json + app.json in one shot
│   └── init.sh            ← one-shot placeholder replacement; run via app-bootstrapper, not manually
│
├── store-listing/         ← App Store / Play Store metadata (created on first ASO refresh)
│
├── .github/workflows/     ← CI: release.yml auto-tags on merge to main
│
└── .claude/
    ├── CLAUDE.md          ← FULL project instructions (read this!)
    ├── SKILLS.md          ← agent → skills matrix
    ├── agents/            ← 8 specialist subagents (see below)
    └── skills/            ← 18 vendored skill packs (ship with the template, no per-machine install)
```

### Key files an agent will touch most often

| Want to… | Edit |
|---|---|
| **Bootstrap a new app** | **invoke `app-bootstrapper` agent — do not run `scripts/init.sh` by hand** |
| Add a screen | `app/<name>.tsx` (and `app/(tabs)/_layout.tsx` if it's a tab) |
| Test a screen | Copy `src/__tests__/screens/home-screen.test.tsx` and swap the import — see [docs/testing.md](docs/testing.md). Tests must **not** live under `app/`; Expo Router would turn them into routes |
| Add or extend a store | `src/store/use<Name>Store.ts` |
| Wire a third-party SDK | `src/services/<name>.ts` + a store in `src/store/` |
| Change theming | `src/theme/` (then use `useTheme()` everywhere) |
| Persist data | `src/utils/storage.ts` helpers — never `AsyncStorage.*` directly. Read it back with `loadJson(key, fallback, schema)`: persisted blobs are untrusted input, and the bare two-argument form is an unchecked cast |
| Add a persisted shape | Write the zod schema in `src/types/schemas.ts` **first**, then derive the type with `z.infer` in `src/types/index.ts` — never hand-roll a `typeof` guard alongside a type |
| Wire an auth backend | **`bash scripts/add-backend.sh <supabase\|firebase>`** — do not hand-roll it. For any other backend, implement the `AuthProvider` port in `src/services/auth/types.ts` and swap the one export in `src/services/auth/index.ts`. **Never edit `useAuthStore` or the `(auth)` screens** — they are provider-agnostic |
| Add Sign in with Apple | **`bash scripts/add-social-auth.sh`** after the backend. No arguments — it detects Supabase or Firebase from the adapter present. It composes `socialAuth` onto the provider — still no store or screen edits. Adds native code: breaks Expo Go and invalidates the EAS cache, so say so |
| Wire account deletion | The adapter's `deleteAccount()` — it **must throw on remote failure** and leave local state intact; `useAuthStore` and `settings.tsx` already depend on that |
| Change the privacy policy | `store-listing/privacy-policy-template.html`, then republish the app's page in the `focalstudio.github.io` repo |
| Cut a release | invoke `release-manager` subagent — do not do this by hand |

---

## Agent registry

Eight specialists in [.claude/agents/](.claude/agents/). The table of who does what is in
[.claude/CLAUDE.md](.claude/CLAUDE.md); which skills each loads and when is in
[.claude/SKILLS.md](.claude/SKILLS.md). Both are authoritative — this file does not restate them.

Delegate by domain; do it yourself when it is a one-line fix, a rename, or a question.


## Dependency Gate

New npm package needed? It goes through `devops-agent` before any code is written. A subagent that discovers one mid-run **stops** and returns a `PACKAGES_NEEDED` block rather than installing.

Full flow and the block format: [.claude/reference/dependency-gate.md](.claude/reference/dependency-gate.md).


## Top mistakes to avoid

1. **Editing on `main` or `dev` directly.** Always branch first. (Exception: `app-bootstrapper` initialising a brand-new repo.)
2. **Hardcoding colors, spacing, or font sizes.** Use `useTheme()` and tokens in `src/theme/`.
3. **Calling `AsyncStorage.getItem/setItem` directly.** Use `src/utils/storage.ts` — there was a null-handling bug (commit `825e87b`) the helpers paper over. They are **named exports** (`loadJson`, `saveJson`, `removeItem`, …), not a `storage` object; prefix keys with `STORAGE_PREFIX`.
4. **Adding a native module config plugin without flagging it.** It invalidates the EAS build cache. Surface this in your report.
5. **Putting keyboard input inside a modal.** iOS layout shifts. Use pickers/toggles.
6. **Merging the release PR with `--delete-branch`.** Auto-closes the dev backmerge PR. Use `gh pr merge NNN --merge` only.
7. **Letting a subagent open PRs.** Subagents return reports; the orchestrator handles git/PR.
8. **Skipping `CHANGELOG.md` for user-visible changes.** Always update under `## [Unreleased]`.
9. **Installing npm packages without going through `devops-agent`.** Always run the Dependency Gate — even for "harmless" packages. The user decides, not the agent.
10. **Running `scripts/init.sh` manually without confirmed parameters.** Always let `app-bootstrapper` gather and confirm the full parameter set first. A wrong run requires manual sed fixes across ~30 files.

---

## Output format the user expects from you

Stated once, in [.claude/CLAUDE.md](.claude/CLAUDE.md) under "Output format". Follow it there.


## Where to find more

- Full conventions, release workflow, ASO rules, GitHub labels → [.claude/CLAUDE.md](.claude/CLAUDE.md)
- Agent → skills matrix → [.claude/SKILLS.md](.claude/SKILLS.md)
- Individual agent specs → [.claude/agents/](.claude/agents/)
- Setup, local run instructions → [README.md](README.md)
