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

- **`/standup`** — run at the **start of a session**, or any time I ask "where are we / what's the status". A read-only, git-derived one-screen briefing with live roadmap progress bars. Never edits files.
- **`/wrap`** — run at the **end of a session**, before stopping. Refreshes `STATUS.md` and `ROADMAP.md` so the next `/standup` is accurate.

`STATUS.md` (Now / Next / Blockers) and `ROADMAP.md` (phased `- [ ]` checkboxes) at the repo root are the tracking source of truth for these commands — keep them current. They are the fast, git-local glance; the Obsidian vault docs (see below) remain the richer narrative. The two are complementary, not duplicative.

## Release workflow
When the user says to cut a release:

1. Create `release/x.x.x` off `dev`.
2. Run `bash scripts/bump-version.sh x.x.x` — updates `package.json` and `app.json` version in one step.
3. Move `## [Unreleased]` in `CHANGELOG.md` to `## [x.x.x] — YYYY-MM-DD`; add a fresh empty `## [Unreleased]` section above it.
4. Update `DEV_MODE_KEY` in `src/constants.ts` to match the new version string.
5. **Pre-emptive code review**: before opening the PR, review every file changed since `dev`. For each changed TypeScript and React file, check for: broken async contracts, state not reset on all exit paths, missing guards in async callbacks, resource cleanup gaps (notifications, timers), timing races, and type contract mismatches. Fix all real bugs found before opening the PR. This prevents cascading review rounds from CI.
6. **Sync with main before opening the PR**: run `git fetch origin main && git merge origin/main` on the release branch. Conflicts, if any, will only be version strings; keep ours. This prevents GitHub rejecting the PR with a merge conflict.
7. Open a PR: `release/x.x.x` → `main`.
8. The `release.yml` GitHub Actions workflow automatically creates tag `vx.x.x` and publishes a GitHub Release on merge — no manual tagging needed.
9. **Immediately after step 7** (do not wait for main merge), open a second PR: `release/x.x.x` → `dev` (to keep dev in sync).
   > **Critical**: when merging the `release/x.x.x` → `main` PR via `gh pr merge`, **never use `--delete-branch`**. Deleting the head branch auto-closes the backmerge PR. Use `gh pr merge NNN --merge` only. Delete the release branch manually after both PRs are merged.
10. Follow the **Apple App Store checklist** in [.claude/reference/store-submission.md](reference/store-submission.md) for the iOS upload.
11. Follow the **Google Play checklist** in the same file for the Android upload — `release.yml` calls `android-release.yml` automatically as part of the same run right after creating the `vx.x.x` tag in step 8, but Play Console review steps are still manual.
12. Verify dev mode is off on device before store submission.

## Automated release workflow
`.github/workflows/release.yml` triggers on every push to `main`. It:
1. Reads the version from `package.json`.
2. Checks whether tag `vVERSION` already exists (skips all steps if it does — safe to re-run).
3. Extracts the matching `## [VERSION]` section from `CHANGELOG.md` as release notes.
4. Creates and pushes an annotated git tag `vVERSION`.
5. Creates a GitHub Release with the extracted release notes.
6. If (and only if) a new tag was actually created in this run, calls `.github/workflows/android-release.yml` as a reusable workflow (`uses:` + `secrets: inherit`) in a dependent job — no PAT or extra secret needed, since a `push: tags:` trigger would never fire for a tag pushed with the default `GITHUB_TOKEN`.

`.github/workflows/android-release.yml` itself has no tag trigger — it's `workflow_call` (invoked by `release.yml` above) plus `workflow_dispatch` for manual reruns (e.g. re-submitting after fixing something in Play Console). It runs `eas build --platform android --profile production` then `eas submit --platform android --profile production --latest` against the `internal` Play track. Requires the one-time keystore + service-account setup in [KEYSTORE.md](../KEYSTORE.md) — it will no-op with a clear message if the app hasn't been bootstrapped yet, but will fail if bootstrapped and the setup hasn't been done.

> **For the full simultaneous iOS + Android release procedure — recurring flow, the one-time Android bootstrap, what's automated vs manual, and verification — use the [`parallel-release`](skills/parallel-release/SKILL.md) skill (`/parallel-release`).** The checklists below are the per-store manual tails of that procedure.

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

## Expo Router navigation patterns
- Every screen is a file in `app/`. To add a new screen: create `app/new-screen.tsx`.
- Use route groups for sections: `(auth)` for unauthenticated, `(tabs)` for main app.
- To add a tab: create a file in `app/(tabs)/` and add a `<Tabs.Screen>` entry in `app/(tabs)/_layout.tsx`.
- Navigate with `router.push("/path")`, `router.replace("/path")`, or `router.back()`.
- Use `useFocusEffect` to track screen analytics on focus.

## Module guidance
- **Onboarding**: `app/onboarding.tsx` + `src/store/useOnboardingStore.ts`. Slides live in the `SLIDES` array.
- **Auth**: `app/(auth)/` screens + `src/store/useAuthStore.ts`. Wire backend by replacing placeholder calls in `login.tsx` / `signup.tsx`.
- **Paywall**: `app/paywall.tsx` + `src/store/usePaywallStore.ts`. See RevenueCat integration comments in both files.
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
`gh label list --repo [GITHUB_REPO]` first to confirm they exist.

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

This repo ships a **three-layer permission system** so Claude can work autonomously without prompts for routine operations, while hard-blocking genuinely destructive commands.

### Layer 1 — Project shared (`.claude/settings.json`, tracked)
Committed to git → propagates automatically to every repo cloned from this template. Contains:
- **Allowlist:** all safe dev operations (git workflow, npm project-scoped, expo, gh CLI, shell utilities, WebFetch to dev domains)
- **Denylist (always blocked, no override):**
  - `git push --force` / `git push -f` — no remote history rewrites
  - `git push origin main` — no direct push to main; always via PR
  - `rm -rf` / `rm -r` — no recursive deletes
  - `sudo` — no privilege escalation

### Layer 2 — Project personal (`.claude/settings.local.json`, gitignored)
Your machine-specific overrides. Copy `.claude/settings.local.json.template` to `.claude/settings.local.json` to activate. Use this to add permissions that are personal (e.g., custom Homebrew paths) or that you explicitly trust `devops-agent` to use autonomously (e.g., `brew install`, `npm install -g`).

### Layer 3 — Global (`~/.claude/settings.json`, user home)
Applies to all projects. Lowest specificity — project settings take precedence.

### What "neither allow nor deny" means
If a command is not in the allowlist AND not in the denylist, Claude Code **prompts the user**. This is intentional for extended operations like `brew install`, `pip install`, and `npm install -g` — they prompt, which gives the user a second confirmation after the devops-agent's risk report.

---

## Dependency Gate

Every task that requires new npm packages goes through the **Dependency Gate** before any code is written. This keeps the user in control of what enters the project and ensures the coding workflow runs uninterrupted after approval.

### Orchestrator pre-flight checklist

When the user's request implies new packages:

1. Identify the packages needed (check `package.json` — only flag what's missing).
2. Spawn `devops-agent` in pre-flight mode with the package list.
3. `devops-agent` assesses risk and surfaces a report to the user.
4. User approves / rejects / substitutes.
5. `devops-agent` installs approved packages and returns an `INSTALLATION_RECEIPT`.
6. Spawn the coding subagent(s) with the receipt attached: "Pre-approved packages: X, Y, Z (installed)."

### Mid-run discovery

If a coding subagent discovers an unexpected package need mid-run:

1. The subagent **stops** and returns a `PACKAGES_NEEDED` block + `STATUS: awaiting_approval`.
2. The orchestrator forwards to `devops-agent`.
3. After the receipt, the orchestrator resumes the subagent with "Package X is now installed."

### PACKAGES_NEEDED format

```
PACKAGES_NEEDED:
  - package: @supabase/supabase-js
    reason: Supabase JS client for auth and database access
  - package: expo-camera
    reason: Native camera access for QR scan feature

STATUS: awaiting_approval
```

### devops-agent invocation modes

| Mode | Trigger | Who calls it |
|---|---|---|
| Pre-flight | Orchestrator predicts packages before coding starts | Orchestrator |
| Mid-run discovery | Subagent returns `PACKAGES_NEEDED` block | Orchestrator (relays from subagent) |
| Explicit user request | "use the devops agent to install X" | Orchestrator (direct) |

**`devops-agent` is never auto-spawned for non-package tasks.** It is a leaf agent — it does not spawn other agents.

---

## Multi-agent workflow

All eight specialist subagents live in [.claude/agents/](agents/) and ship with the template — no per-machine install. The main Claude Code session (running Opus) acts as the **orchestrator** — it never does all the work itself, it delegates.

Each agent declares its own `model` and `effort` in frontmatter, tiered by how expensive a mistake is. Do not override these per-spawn unless the brief is genuinely atypical.

| Agent | Purpose |
|---|---|
| `ios-frontend` | React Native + Expo UI work |
| `backend-integrator` | Third-party service integration |
| `test-engineer` | Jest unit + screen-render tests; owns `src/__tests__/**` |
| `release-manager` | Runs the full release workflow above |
| `aso-marketing` | Store-listing copy with hard char-limit enforcement |
| `qa-reviewer` | Read-only pre-PR review |
| `devops-agent` | Package risk assessment + controlled installation |
| `app-bootstrapper` | Full new-app bootstrap: Q&A → IDEA.md → init.sh → GitHub repo + issues → onboarding slides + store listing |

Model/effort per agent and which skills each agent loads — and the conditions under which it loads them — is in [.claude/SKILLS.md](SKILLS.md), the single source of truth for both. Do not duplicate that data here.

### Bootstrap trigger

When the user says any of the following, classify as `bootstrap` and **spawn `app-bootstrapper` immediately** — no pre-planning needed, the agent owns the full workflow:

- "bootstrap a new app"
- "start a new app from the template"
- "I have an idea for an app: …"
- "initialise / initialize a new project"
- "set up [app name]" (from a fresh clone)

Pass the verbatim user message as the brief. The agent handles all Q&A and execution.

### Orchestration playbook

When a user request arrives:

1. **Classify** into `bootstrap`, `frontend`, `backend`, `test`, `release`, `marketing`, `review`, `devops`, or `mixed`.
2. **Check for package needs** — if the task requires new packages, run the Dependency Gate (see above) before spawning coding agents.
3. **For single-domain requests:** spawn the matching subagent with a *fully self-contained brief* — exact file paths, expected behavior, what to return. The orchestrator plans, the subagent executes. **Never** delegate planning ("figure out what to do") — that wastes the subagent's context re-deriving what the orchestrator already knows.
4. **For mixed requests:** decompose into independent subtasks and spawn subagents in parallel (single message, multiple `Agent` tool calls) when there are no cross-dependencies.
5. **Subagents return reports.** The orchestrator handles commits, `CHANGELOG.md` updates, and PR creation. Subagents must not open PRs themselves — this avoids race conditions when multiple agents touch the same branch.
6. **Skills inside subagents.** Each subagent's `.md` declares which skills it loads and **under what conditions** — most are conditional, because loading a skill costs context. The subagent decides from the brief; the orchestrator doesn't specify skills. Write briefs that describe the task shape ("restyle the paywall header", "one-line spacing fix") so the subagent can match the right row.

### When NOT to delegate

Skip subagent delegation when the task is a single trivial edit (one-line fix, typo, rename) or a pure information question. Spawning a subagent for those just adds a roundtrip.

### Long-report handoff

When a subagent's report would exceed ~50 lines (full `qa-reviewer` audit, deep backend integration write-up, design analysis), the subagent writes the full report to `.claude/scratch/<agent>-<YYYYMMDD-HHMM>.md` and returns only:

1. The file path.
2. A 3-bullet executive summary (blockers / decisions / what changed).

The orchestrator reads from disk on demand. This keeps the orchestrator context lean during mixed/parallel runs and avoids context degradation when summaries get re-summarized across roundtrips. `.claude/scratch/` is gitignored.

- **Filename timestamp:** generate with `date +%Y%m%d-%H%M`.
- **Directory creation:** agents do not need to `mkdir` — `Write` creates parent dirs automatically.

---

## What not to do
- Do not make secretive changes.
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
