# CLAUDE.md

This file gives project-specific instructions for working on **[APP_NAME]** in VS Code with the Claude extension.

## Tech stack

- **Runtime:** React Native (via Expo SDK 56, New Architecture enabled)
- **Navigation:** Expo Router (file-based, `app/` directory)
- **State management:** Zustand (`src/store/`)
- **Styling:** React Native `StyleSheet` + design-token constants (`src/theme/`)
- **Icons:** `lucide-react-native` (backed by `react-native-svg`)
- **Services:** `expo-haptics`, `expo-notifications`, `expo-store-review`, PostHog RN SDK
- **Storage:** `@react-native-async-storage/async-storage` (helpers in `src/utils/storage.ts`)
- **Build / distribution:** EAS Build + EAS Submit
- **CI:** GitHub Actions (`.github/workflows/`)

## Dependency versions

**`VERSIONS.md` at the repo root is the authoritative version reference.** It lists every pinned dependency, the core stack versions, and an upgrade checklist.

- **Before installing a new package:** read `VERSIONS.md` to understand the current SDK generation and avoid version conflicts.
- **After any dependency update:** update `VERSIONS.md` to reflect the new versions, then update `CHANGELOG.md`.
- **Always use `--legacy-peer-deps`** for `npm install` and `npm ci` — a known `jest-expo` peer conflict requires it (already set in all CI workflows).
- **Use `npx expo install --fix` not `npm update`** when upgrading Expo-ecosystem packages.

## Project goals
- Build [APP_NAME] incrementally and safely.
- Keep the codebase easy to understand and easy to ship.
- Prefer small, testable changes over big rewrites.
- Preserve a stable main branch.
- Make Git history clean and reviewable.

## Branch strategy

The repo uses a **Git Flow lite** model:

```
main        ← production / store releases only. Never commit directly.
dev         ← integration branch. All features and fixes land here first.
feat/*      ← new features. Branch off dev, PR back to dev.
fix/*       ← bug fixes. Branch off dev, PR back to dev.
release/*   ← release stabilisation. Cut from dev, merge to main + tag.
```

**Hotfixes** (critical prod bug): branch off `main`, fix, PR to `main`, tag, then also PR to `dev`.

## Default workflow
When asked for code changes, follow this workflow unless explicitly told otherwise:

1. Inspect the current repository state (`git status`, `git log --oneline -5`).
2. Explain briefly what you plan to change.
3. **Branch off `dev`** (not `main`) before editing files.
4. Use a clear branch name (see naming convention below).
5. Make the smallest set of changes needed.
6. Update `CHANGELOG.md` under `## [Unreleased]` for any user-visible change.
7. Show which files changed and why.
8. Push the branch and **open a PR targeting `dev`** using `gh pr create --base dev`.
9. Suggest how to test the change locally.

If a branch already exists for the task, use that branch instead of creating a second one.

## Session workflow
Two slash commands bracket every work session (defined in [.claude/commands/](commands/)):

- **`/standup`** — a read-only, git-derived one-screen briefing with live roadmap progress bars. Never edits files. Reads the dashboard's cached JSON (`~/.focalstudio/fleet.json`) where it is fresh, rather than re-deriving everything from `gh`.
- **`/wrap`** — refreshes `STATUS.md` and `ROADMAP.md`. **You should not need to run this**: the `Stop` hook makes the session do it unprompted (below). It remains as a command for when you want the update mid-session.

A third, **`/fleet`**, zooms out to every repo in the org rather than this one — database, last release, unreleased commits, CI, open work and roadmap bar per repo. `/standup` is one repo deep; `/fleet` is every repo shallow. Use it when picking up work after a gap, before a release, or when asked "what's the state of everything".

**Status upkeep is automatic, not a ritual.** `.claude/hooks/wrap-reminder.sh` runs on the `Stop` hook (wired in `.claude/settings.json`): if the branch has commits that post-date the last `STATUS.md` commit, it blocks the session from stopping and instructs it to do the update itself. It fires at most once per session — a session-scoped marker in `/tmp` keyed on `session_id` stops it nagging every turn.

The hook used to tell the *user* to run `/wrap`. That moved the forgetting one step along rather than fixing it: the nudge lands at the end of a session, exactly when nobody wants to type another command, so sessions ended unwrapped anyway. It now hands over the commit subjects and the rules, and the session writes the update before stopping.

Its scope is deliberately narrow, because it is the one place work happens without being asked for:

- **Only `STATUS.md` and `ROADMAP.md`.** Nothing else is touched or staged.
- **It commits on a feature branch, with `chore: refresh status`, and never pushes.** On `main` or `dev` it updates the files and leaves them in the working tree — those branches take changes through a PR, and a hook is not a PR.
- **It is announced.** The session says in one line what it changed, so the write is visible rather than silent. This is what keeps it compatible with "do not make secretive changes" rather than an exception to it.

`STATUS.md` (Now / Next / Blockers) and `ROADMAP.md` (phased `- [ ]` checkboxes) at the repo root are the tracking source of truth for these commands — keep them current. They are the fast, git-local glance; the Obsidian vault docs (see below) remain the richer narrative. The two are complementary, not duplicative.

### Fleet inventory

`bash scripts/fleet-report.sh` answers "what is the state of every app" without opening six repos by hand. It is read-only and **hand-maintains nothing**: the repo list comes from `gh repo list` against the org derived from `origin`, so a new app appears the moment it is created and there is no manifest to keep in sync. Same call as the drift report — it reports, it never writes to a remote.

- **Database detection is ordered, and prints its evidence.** `env.js`'s `BACKEND` constant is the app's own declaration and wins where it exists; otherwise the verdict is inferred from `package.json` dependencies (`@supabase/supabase-js` → Supabase, `firebase` → Firestore, `expo-sqlite` → SQLite, async-storage alone → local-only). Dependencies are the only signal that works fleet-wide: `env.js` exists solely in repos generated from the current template, so it is absent from mealcart, WildFocus and vestia.
- **Roadmap bars come from `dev`, not the default branch**, falling back when there is no `dev`. Reading them from `main` reports progress as of the last release rather than as of now. The bar arithmetic is lifted from `/standup` so one app's percentage means the same thing in both.
- **Output is never committed.** This template repo is public and most app repos are private; versions, release notes and issue titles are the part that matters, so `--write` targets gitignored `.claude/scratch/`.
- **A scheduled cross-repo version runs weekly** — `.github/workflows/cross-repo-report.yml`, built on the `--json` seam, using the GitHub App in [.claude/reference/cross-repo-token.md](reference/cross-repo-token.md) (#166). It publishes **counts only**: this repo is public, so its run summary and step log are world-readable, while the reports describe private apps. The local script stays the way to read the detail.

## Cross-repo propagation

**`.github/shared-paths.json` is the template ↔ generated-app boundary, written down.** Everything listed in it is meant to stay the same across this repo and the apps generated from it (`.claude/**`, `.github/workflows/*`, `scripts/*`, `templates/**`, `.maestro/*`, `docs/*`). Everything outside it — `app/`, `src/store/`, `src/theme/`, `assets/`, `store-listing/` — is meant to diverge. Before this file existed that distinction was written down nowhere, which is half of why fixes kept failing to travel (#145).

Two mechanisms consume it, one per direction:

- **Outbound** — `/wrap` step 2 intersects the session's changed files with the manifest and asks whether the change needs to travel. Fires in the repo where the fix was written.
- **Inbound** — `bash scripts/drift-report.sh` compares against every app in the manifest's `apps` list. Catches a repo sitting on a stale copy that nobody is currently editing, which is the half `/wrap` structurally cannot see. Run it when picking up template work after a gap, and before cutting a release.

**The app → template direction is the one that fails.** Three of the four instances in #145 travelled that way, and the reason is structural rather than accidental: `maestro-e2e.yml` skips at the `[APP_SLUG]` bootstrap gate, so `.maestro/*.yaml` is only ever *executed* inside a generated app. Every runtime defect in those flows is discovered downstream by construction. The same shape applies to anything needing real data, real users, or a real Supabase project. When an app teaches you something, assume it belongs upstream.

**Do not build a sync-and-apply script.** It has been considered and rejected, not deferred. tick's `.maestro` flows differ from the template's by 59 lines, 58 of which are correct app-specific prose and 1 of which was a real unpropagated fix; a copy in either direction destroys the 58 to deliver the 1. Nothing mechanical can tell them apart — that is the judgment the human diff read exists for. Extend the report, not the writer.

A scheduled cross-repo version of the report **is built and runs weekly** (`cross-repo-report.yml`, #166). Reading private sibling repos from CI needs a credential the default `GITHUB_TOKEN` cannot provide; that decision was taken once, for both consumers, alongside #56 — see [.claude/reference/cross-repo-token.md](reference/cross-repo-token.md). The App is provisioned, `drift-report.sh`'s `sync_clone` authenticates with `GH_TOKEN`, and the workflow reaches `main` as of 0.16.0, which is what lets a `schedule:` fire at all. It reports counts to the run summary and nothing more — the bodies name private repos and this repo is public. The local script remains where the detail is read.

**Any workflow writing to another repo opens a PR — never commits, never merges.** Same reason the drift report reports rather than applies: the receiving copy may be deliberately better. `publish-privacy.yml` is the reference implementation.

## Release workflow

Cut from `dev` into `release/x.x.x`, bump with `bash scripts/bump-version.sh x.x.x`, move `## [Unreleased]` in `CHANGELOG.md`, review every changed file before opening the PR, sync with `main`, then open **two** PRs: `release/x.x.x` → `main` and `release/x.x.x` → `dev`. `release.yml` tags and publishes on merge; it also chains the Android build.

> **Never `gh pr merge --delete-branch` on the release → main PR** — deleting the head branch auto-closes the backmerge PR.

Full step-by-step, what `release.yml` and `android-release.yml` each do, and the store checklists: [.claude/reference/release-workflow.md](reference/release-workflow.md) and the [`parallel-release`](skills/parallel-release/SKILL.md) skill (`/parallel-release`), which is authoritative for a simultaneous iOS + Android release.


## Store submission checklists

The per-store manual tails of the release workflow — Apple App Store steps, Google Play steps,
and the **data safety checklist that must be re-run before every submission** (account deletion,
analytics opt-out, privacy-policy URL, listing URL drift):
[.claude/reference/store-submission.md](reference/store-submission.md).

First-ever Android release for a newly bootstrapped app also needs the one-time setup in
[KEYSTORE.md](../KEYSTORE.md) before any tag push.

## Git safety rules
- Never commit directly to `main` or `dev`.
- Never merge to `main` automatically — always via PR.
- Never delete branches unless explicitly asked.
- Before making edits, check `git status` and warn about uncommitted local changes.
- If the work is risky or broad, propose a short plan before changing code.
- Prefer atomic commits.
- Always use `gh pr create` (full path `/opt/homebrew/bin/gh` if `gh` is not in PATH).

## Parallel sessions: use a worktree, never a shared checkout

If more than one session (or a session alongside your own manual work) will touch this repo at the same time, **each gets its own `git worktree`**. Two sessions sharing one checkout silently step on each other: a `git checkout` in one moves the other's `HEAD`, and commits land on the wrong branch. Both of the failures this rule exists for happened here, in one session.

If a branch or `HEAD` moves unexpectedly mid-session, stop and check `git reflog` before doing anything else.

Setup commands and the CI-goes-green-while-most-of-it-never-ran hazard: [.claude/reference/worktrees.md](reference/worktrees.md).


## Expo Router navigation patterns
- Every screen is a file in `app/`. To add a new screen: create `app/new-screen.tsx`.
- Use route groups for sections: `(auth)` for unauthenticated, `(tabs)` for main app.
- To add a tab: create a file in `app/(tabs)/` and add a `<Tabs.Screen>` entry in `app/(tabs)/_layout.tsx`.
- Navigate with `router.push("/path")`, `router.replace("/path")`, or `router.back()`.
- Use `useFocusEffect` to track screen analytics on focus.

## Module guidance
- **Onboarding**: `app/onboarding.tsx` + `src/store/useOnboardingStore.ts`. Slides live in the `SLIDES` array.
- **Auth**: `app/(auth)/` screens + `src/store/useAuthStore.ts`. Wire backend by replacing placeholder calls in `login.tsx` / `signup.tsx`.
- **Paywall**: `app/paywall.tsx` + `src/store/usePaywallStore.ts` consume the `PaywallProvider` port in `src/services/paywall/`; both are provider-agnostic. Wire a real provider with `bash scripts/add-paywall.sh revenuecat` — never by calling `Purchases.*` from the store or the screen.
- **Settings**: `app/(tabs)/settings.tsx` — add new settings rows in their respective `Card` sections.
- **Theme**: `src/theme/` — all design tokens. Use `useTheme()` hook in every component.

## Coding style
- Keep functions and components small.
- Prefer readable code over clever code.
- Reuse existing patterns in the repository.
- Avoid unnecessary dependencies.
- Avoid large-scale refactors unless asked.
- Keep platform-specific code isolated when possible.
- When fixing bugs, explain the root cause briefly.

## iOS-first guidance
- Test on iOS Simulator first (`npx expo start --ios`).
- Mark any Android-specific behaviour explicitly in comments.
- Preserve build stability — never change `app.json` native fields without checking EAS build impact.
- If a feature affects store readiness or requires a native module rebuild, call that out.
- **Replace placeholder assets before first build**: swap `assets/images/splash.png`, `assets/images/icon.png`, and `assets/images/adaptive-icon.png` with your app's real artwork, and update the `expo-splash-screen` plugin's `image` field in `app.json` to point to the correct file. The template ships generic placeholder images that will appear in the App Store and on the launch screen if not replaced.

## Xcode Cloud CI

`ios/ci_scripts/ci_post_clone.sh` prepares the Expo managed project before every Xcode Cloud
build (npm ci → `expo prebuild` → `pod install`). Xcode Cloud discovers it automatically.
EAS Build is the default and needs none of this.

What the hook does, how to enable Xcode Cloud, and EAS vs Xcode Cloud trade-offs:
[.claude/reference/xcode-cloud.md](reference/xcode-cloud.md).

## Mobile app guidance
Assume [APP_NAME] is intended to ship and iterate like a real product.

- Prefer cross-platform-safe changes where possible.
- Keep iOS and Android differences explicit and minimal.
- If adding a new feature, suggest whether it belongs in shared logic, UI layer, or a service.
- Do not add keyboard entry inside modals — use fixed-choice UI (pickers, toggles) instead. The keyboard causes unexpected layout shifts inside modals on iOS.

## File change behavior
- Do not rename or move many files unless necessary.
- Do not rewrite working files just to match a preferred style.
- Keep diffs small.
- Preserve comments that contain project-specific context.
- If configuration changes are needed, explain impact before making them.

## Testing behavior
When making changes:
- Suggest the fastest way to verify them locally.
- Prefer focused tests over broad test rewrites.
- If no tests exist, provide a short manual test checklist.
- For UI changes, describe the expected visible result.

## Dev mode rules
Dev mode (5-tap title toggle) is off by default and protected by a version-scoped AsyncStorage key (`DEV_MODE_KEY` in `src/constants.ts`).

- When `APP_VERSION` is bumped, `DEV_MODE_KEY` changes automatically — resetting dev mode on the user's device.
- A fresh install or version update always starts with dev mode off.
- Do not add build-time environment guards (`__DEV__` or `process.env.NODE_ENV`) to the toggle — these break dev mode in production EAS builds on feature branches.

### Gating dev-only affordances: use `isDevBuild`

`isDevBuild` (`src/env.ts`) is the canonical gate for anything that must never be reachable in a store build — dev seams, debug screens, maintainer tools. Import it rather than testing `__DEV__` yourself.

```ts
isDevBuild = __DEV__ || (gitBranch !== null && !isStoreBranch(gitBranch))
// store-bound: `main`, or anything under `release/`
```

`gitBranch` is baked into the Expo manifest by `resolveGitBranch()` in `app.config.js` (`GITHUB_REF_NAME` → `CI_BRANCH` → `git rev-parse`). Both inputs are fixed when the bundle is built, so there is no env var to set and no runtime flag to flip.

- **Why not `__DEV__` alone?** Same reason as the rule above: a production-profile build off a feature branch has `__DEV__ === false`, which is exactly the build you want the affordance in.
- **Unresolvable branch (`null`) counts as production.** Fail closed — a missing dev affordance is an inconvenience, a shipped one is a store incident.
- **`release/*` counts as production.** Xcode Cloud sets `CI_BRANCH` from a real checkout, so a workflow archiving off a release branch would otherwise ship dev affordances to TestFlight testers and App Review.
- **Caveat:** a *remote* EAS build has neither CI variable and no `.git`, so `gitBranch` is null there and dev affordances are absent. Use a development-profile build, or `eas build --local` from CI, when you need them.
- **Still your responsibility:** `eas build --local --profile production` off a `feat/*` branch bakes dev affordances in. That build is not a store path under the release workflow above, but nothing in the code stops you distributing it.
- Keep the gate as the first thing in the component (`if (!isDevBuild) return null;`) so there is exactly one place to audit. `src/components/dev/DevSeedSessionButton.tsx` is the reference.

## UI/UX design rules
- Skill selection for UI/UX or frontend work is conditional, not automatic — see the `ios-frontend` row of the routing matrix in [.claude/SKILLS.md](SKILLS.md) for which of `frontend_design`, `ui-ux-pro-max`, and `design-for-ai` to load for a given task shape.
- Use design tokens from `src/theme/` — never hardcode colours, spacing, or typography values.
- Match iOS platform conventions (system font sizes, safe area insets, tab bar heights).
- Use `lucide-react-native` for all icons. Always pass `color` from `useTheme()` — never hardcode icon colors or sizes.

## Output format
For most tasks, respond in this structure:

1. **Plan** — one short paragraph or bullets.
2. **Branch name** — the branch you will create or use.
3. **Files to change** — short list.
4. **Implementation notes** — concise.
5. **Test steps** — concrete local checks.
6. **Commit message** — one suggested message.

## Branch naming convention
Use one of these prefixes:
- `feat/`
- `fix/`
- `refactor/`
- `docs/`
- `chore/`
- `test/`

Then add a short kebab-case description.

Examples:
- `feat/add-daily-checkin-screen`
- `fix/notification-scheduling`
- `refactor/paywall-store`
- `docs/setup-instructions`

## When asked questions instead of changes
- Answer first.
- Then propose the smallest concrete next step.
- Suggest a branch only if code changes are actually needed.

## When GitHub is available
- Prefer pushing feature branches to remote.
- Prefer opening a pull request instead of merging directly.
- Suggest PR title and description.
- Keep remote and local branch names the same.

## When only local repo access is available
- Still create local branches first.
- Prepare clean commits locally.
- Tell the user when they should push the branch themselves.
- If a task would benefit from PR review, say so explicitly.

## Obsidian documentation

Vault: `~/Obsidian/Projects/[APP_NAME]/`. Produce or refresh
vault docs after a full audit, when a phase is planned, when a significant feature ships, or on
explicit request.

File naming, frontmatter, callout/emoji conventions, and the Kanban board format:
[.claude/reference/obsidian.md](reference/obsidian.md).

## GitHub issue labels

Always apply labels when creating issues: one **type** (`bug` / `enhancement` / `chore` /
`documentation` / `question`), one **priority** (`critical` / `high` / `medium` / `low`), and
one **milestone** (`open-beta` / `public` / `post-release`). Run
`gh label list --repo [GITHUB_REPO]` first to confirm they exist — if any are missing, run
`bash scripts/sync-labels.sh` to re-apply the manifest in `.github/labels.tsv`.

Full tables and typical combinations: [.claude/reference/issue-labels.md](reference/issue-labels.md).

---

## ASO (App Store Optimization)

Scoring system, field hierarchy, character limits, keyword tiers, and the pre-submission
checklist all live in the [`aso-rules`](skills/aso-rules/SKILL.md) skill — load it when
drafting or auditing listing copy. `aso-marketing` loads it automatically.

Store metadata is version-controlled in `store-listing/ios-appstore-listing.md` and
`store-listing/play-store-listing.md`.

---

## Permission model

Three layers: project-shared `.claude/settings.json` (tracked, travels to every generated app), project-personal `.claude/settings.local.json` (gitignored), and global `~/.claude/settings.json`. Safe dev operations are allowlisted so routine work runs unprompted.

**Always blocked, no override:** `git push --force`, `git push origin main`, `rm -rf` / `rm -r`, `sudo`.

A command in neither list **prompts** — that is deliberate for `brew install`, `pip install` and `npm install -g`. Layer detail and how to grant something to `devops-agent`: [.claude/reference/permissions.md](reference/permissions.md).


## Dependency Gate

Every task needing new npm packages goes through `devops-agent` **before any code is written**: it assesses supply-chain risk, surfaces a report, you approve, it installs and returns an `INSTALLATION_RECEIPT`. Coding subagents are then spawned with the receipt attached.

A subagent that discovers an unexpected package need mid-run **stops** and returns a `PACKAGES_NEEDED` block with `STATUS: awaiting_approval` rather than installing anything.

Full checklist, the `PACKAGES_NEEDED` format and the invocation modes: [.claude/reference/dependency-gate.md](reference/dependency-gate.md). `devops-agent` is never auto-spawned for non-package tasks, and it never spawns other agents.


## Multi-agent workflow

All eight specialist subagents live in [.claude/agents/](agents/) and ship with the template. The main session acts as the **orchestrator** — it plans and delegates; it does not do all the work itself.

| Agent | Purpose |
|---|---|
| `ios-frontend` | React Native + Expo UI work |
| `backend-integrator` | Third-party service integration |
| `test-engineer` | Jest unit + screen-render tests; owns `src/__tests__/**` |
| `release-manager` | Runs the full release workflow |
| `aso-marketing` | Store-listing copy with hard char-limit enforcement |
| `qa-reviewer` | Read-only pre-PR review |
| `devops-agent` | Package risk assessment + controlled installation |
| `app-bootstrapper` | Full new-app bootstrap: Q&A → IDEA.md → init.sh → repo + issues |

Each agent declares its own `model` and `effort` in frontmatter. Do not override per-spawn unless the brief is genuinely atypical. Which skills each loads, and under what conditions, is in [.claude/SKILLS.md](SKILLS.md) — do not duplicate that data here.

**Two routing rules that must not wait for a file read:**

- **Bootstrap.** "bootstrap a new app" / "start a new app from the template" / "I have an idea for an app: …" / "set up [name]" → spawn `app-bootstrapper` immediately with the verbatim message. It owns the whole workflow; no pre-planning. New repos are **private**, and `scripts/init.sh` installs the matching LICENSE; `--public` flips both and is the only supported way to make a public app — pass it only on explicit request.
- **Do not delegate** a single trivial edit (one-line fix, typo, rename) or a pure information question. The roundtrip costs more than the work.

**How to brief, decompose, run agents in parallel, and hand back long reports:** [.claude/reference/orchestration.md](reference/orchestration.md). Subagents never open PRs — the orchestrator handles commits, `CHANGELOG.md` and PR creation.


## What not to do
- Do not make secretive changes. **One named exception**: the `Stop` hook's `STATUS.md` / `ROADMAP.md` refresh happens unprompted, because a tracking file that depends on remembering a command drifts. It is bounded and announced — see "Session workflow". Nothing else gets written without being asked for, and this exception does not generalise.
- Do not skip branch creation unless explicitly allowed.
- Do not assume credentials are available.
- Do not run destructive git commands without asking.
- Do not optimize prematurely.

## Preferred decision rule
If there are multiple valid options, choose the one that:
1. keeps the repo safest,
2. keeps the diff smallest,
3. is easiest to test,
4. is easiest to maintain later.
