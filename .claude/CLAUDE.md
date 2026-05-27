# CLAUDE.md

This file gives project-specific instructions for working on **[APP_NAME]** in VS Code with the Claude extension.

## Tech stack

- **Runtime:** React Native (via Expo SDK 56, New Architecture enabled)
- **Navigation:** Expo Router (file-based, `app/` directory)
- **State management:** Zustand (`src/store/`)
- **Styling:** React Native `StyleSheet` + design-token constants (`src/theme/`)
- **Services:** `expo-haptics`, `expo-notifications`, `expo-store-review`, PostHog RN SDK
- **Storage:** `@react-native-async-storage/async-storage` (helpers in `src/utils/storage.ts`)
- **Build / distribution:** EAS Build + EAS Submit
- **CI:** GitHub Actions (`.github/workflows/`)

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
10. Follow the **Apple App Store checklist** for the iOS upload.
11. Verify dev mode is off on device before store submission.

## Automated release workflow
`.github/workflows/release.yml` triggers on every push to `main`. It:
1. Reads the version from `package.json`.
2. Checks whether tag `vVERSION` already exists (skips all steps if it does — safe to re-run).
3. Extracts the matching `## [VERSION]` section from `CHANGELOG.md` as release notes.
4. Creates and pushes an annotated git tag `vVERSION`.
5. Creates a GitHub Release with the extracted release notes.

## Apple App Store checklist
After `release/x.x.x` is merged to `main` and CI is green:

1. `git checkout main && git pull`
2. Run `eas build --platform ios --profile production` (or trigger via GitHub).
3. Monitor the build in the [Expo dashboard](https://expo.dev).
4. When the build completes, download the `.ipa` and upload via Xcode Organizer or `eas submit`.
5. In App Store Connect: select the new build, add release notes (match CHANGELOG), submit for review.
6. Verify dev mode is off: tap the app title 5× — confirm no dev badge appears.

## Git safety rules
- Never commit directly to `main` or `dev`.
- Never merge to `main` automatically — always via PR.
- Never delete branches unless explicitly asked.
- Before making edits, check `git status` and warn about uncommitted local changes.
- If the work is risky or broad, propose a short plan before changing code.
- Prefer atomic commits.
- Always use `gh pr create` (full path `/opt/homebrew/bin/gh` if `gh` is not in PATH).

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

## UI/UX design rules
- Invoke the `frontend_design` and `ui-ux-pro-max` skills whenever making UI/UX or frontend changes.
- Use design tokens from `src/theme/` — never hardcode colours, spacing, or typography values.
- Match iOS platform conventions (system font sizes, safe area insets, tab bar heights).

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

The project Obsidian vault lives at:
```
/Users/fperezmartinez/Desktop/Obsidian_Felipe/Projects/[APP_NAME]/
```

### When to produce Obsidian docs
Produce or update Obsidian documents whenever:
- A full codebase analysis or audit is completed (roadmap, status review)
- A new phase of work is planned or prioritised
- A significant feature is shipped and the roadmap needs refreshing
- The user explicitly asks for a doc, kanban, or dashboard

### File naming convention
Use plain `.md` extension. Keep names short and descriptive:
- `[APP_NAME] Dashboard.md` — at-a-glance status, today's tasks, milestone dates
- `[APP_NAME] Roadmap.md` — full narrative roadmap, phased, with branch names
- `[APP_NAME] Kanban.md` — Kanban plugin board, one column per phase + Done column

### Obsidian formatting rules
Always use:
- **YAML frontmatter** with `tags`, `created`, and optionally `version`
- **Callouts** for warnings, tips, and danger notices: `> [!note]`, `> [!warning]`, `> [!danger]`, `> [!tip]`
- **Wiki links** to cross-reference files: `[[APP_NAME Roadmap]]`
- **Status emoji** in tables: ✅ Done · ❌ Missing · ⏳ Planned · ⚠️ Partial
- **Priority emoji** for items: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Later · ⬜ Deferred
- **Checkboxes** `- [ ]` for all actionable items so the Tasks plugin can track them
- **Tags** on items using `#tag` syntax (e.g. `#critical`, `#high`, `#medium`, `#low`)

### Kanban board format (requires Obsidian Kanban plugin)
```
---
kanban-plugin: board
---

## Column Name

- [ ] Card title #tag

%% kanban:settings
{"kanban-plugin":"board"}
%%
```
Columns: one per phase + a `✅ Done` column pre-populated with shipped features.

### After producing any Obsidian doc
- Update `[APP_NAME] Claude Commands.md` in the same vault folder
- Add the prompt pattern used to the relevant section so it can be reused
- Update frontmatter `created` date if refreshing an existing file

## GitHub issue labels

Always apply labels when creating issues. Use `gh issue create --label "..."` with comma-separated values.

Before creating an issue, run `gh label list --repo [GITHUB_REPO]` to confirm labels exist and discover any new ones. Update this section if new labels appear.

### Type labels (pick one)
| Label | When to use |
|-------|-------------|
| `bug` | Something is broken or behaving incorrectly |
| `enhancement` | New feature or improvement |
| `chore` | Maintenance, dependency updates, CI, tooling |
| `documentation` | Docs-only changes |
| `question` | Needs clarification, not a task yet |

### Priority labels (pick one)
| Label | When to use |
|-------|-------------|
| `critical` | Must ship before the current stage gate / release |
| `high` | Important, should not slip |
| `medium` | Planned for the milestone, can slip |
| `low` | Nice to have |

### Milestone labels (pick one)
| Label | When to use |
|-------|-------------|
| `open-beta` | Required for open beta launch |
| `public` | Required for public v1 launch |
| `post-release` | Follow-up work after a release ships |

> When new version milestones are cut (e.g. v0.5), add the label and retire labels no longer relevant.

### Typical combinations
- New feature for next minor release → `enhancement`, `medium`
- Crash / data loss → `bug`, `critical`
- Docs update → `documentation`, `low`
- CI / tooling fix → `chore`, `medium`

---

## ASO (App Store Optimization)

### Scoring system
- **Popularity** (1–10): estimated search volume. Higher = more searches.
- **Difficulty** (1–10): how hard it is to rank. Lower = less competition.
- **Opportunity** = Popularity − Difficulty. Higher is better.
- **Sweet spot**: Pop ≥ 6, Diff ≤ 4 (Opp ≥ +2).

Scores from Claude are estimates. Always validate with a real tool (AppASO free tier, AppFollow, or Sensor Tower) before submitting.

### iOS App Store field hierarchy

| Field | Chars | Weight | Rule |
|-------|-------|--------|------|
| App Name | 30 | Highest | Lead with primary keyword. Every word is indexed. |
| Subtitle | 30 | High | Cover keywords NOT in the name. No redundant words. |
| Keywords field | 100 | Medium | No spaces after commas. Never repeat words from name or subtitle. |

### Google Play field hierarchy

| Field | Chars | Weight |
|-------|-------|--------|
| Title | 30 | Highest — use most of the 30 chars, not just the brand name |
| Short description | 80 | High — include primary keyword |
| Full description | 4000 | Medium — repeat key terms 3–5× naturally |

### Core ASO rules

1. **No redundant words across fields.** If "timer" is in the name, drop it from subtitle and keyword field.
2. **Split compound brand names.** `WildFocus` = one indexed word. `Wild Focus` = two indexed words. Split if both parts have search value.
3. **Subtitle = second keyword field, not a tagline.** It must add new, non-overlapping keywords.
4. **Keyword field: no spaces after commas.** `study,work,adhd` not `study, work, adhd`.
5. **Avoid generic mega-terms as primary strategy.** "productivity", "focus", "time management" alone are Pop 9–10 / Diff 9–10 — impossible to rank for a new app.
6. **Niche combinations beat broad terms.** "ADHD timer" (Pop 6, Diff 3, Opp +3) beats "focus" (Pop 9, Diff 10, Opp −1) for a new app.

### Keyword opportunity tiers

| Tier | Strategy |
|------|----------|
| Skip (high pop, high diff) | Only use if they appear naturally in name/subtitle |
| Prioritise (high pop, low diff) | Target these first for the keyword field |
| Niche differentiation (low pop, very low diff) | Use to fill the keyword field and differentiate |

### Name / subtitle template

```
[Primary keyword] - [Brand Name]        ← iOS Name (≤ 30 chars)
[Niche A], [Niche B] & [Unique hook]    ← iOS Subtitle (≤ 30 chars)
keyword1,keyword2,keyword3,...          ← Keywords field (≤ 100 chars, no spaces)
```

### Verification

```bash
echo -n "Your Subtitle Here" | wc -c        # must be ≤ 30
echo -n "your,keywords,here" | wc -c        # must be ≤ 100
```

### Checklist before submitting
- [ ] No word repeated between name and subtitle
- [ ] No word in keyword field already appears in name or subtitle
- [ ] Brand name is split if both parts have search value
- [ ] Google Play title uses close to 30 chars
- [ ] Google Play short description includes the primary keyword

### Store listing files
Keep metadata version-controlled:
- `store-listing/ios-appstore-listing.md` — iOS App Store Connect (name, subtitle, keywords, description)
- `store-listing/play-store-listing.md` — Google Play (title, short desc, full desc)

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

All six specialist subagents live in [.claude/agents/](agents/) and ship with the template — no per-machine install. The main Claude Code session (running Opus) acts as the **orchestrator** — it never does all the work itself, it delegates.

| Agent | Purpose | Skills loaded |
|---|---|---|
| `ios-frontend` | React Native + Expo UI work | `frontend_design`, `ui-ux-pro-max`, `design-for-ai`, `rn-*` bundle |
| `backend-integrator` | Third-party service integration | `expo-services`, `react-native-expert`, `typescript-pro`, `rn-data-fetching` |
| `release-manager` | Runs the full release workflow above | `commit`, `commit-push-pr`, `review`, `verify` |
| `aso-marketing` | Store-listing copy with hard char-limit enforcement | `aso-rules`, `ralph-copywriter`, `web-asset-generator` |
| `qa-reviewer` | Read-only pre-PR review | `review`, `security-review`, `simplify`, `tob-*` bundle |
| `devops-agent` | Package risk assessment + controlled installation | `tob-supply-chain-risk-auditor`, `tob-insecure-defaults`, `react-native-expert`, `expo-services` |
| `app-bootstrapper` | Full new-app bootstrap: Q&A → IDEA.md → init.sh → GitHub repo + issues → onboarding slides + store listing | `ralph-copywriter`, `aso-rules` |

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

1. **Classify** into `bootstrap`, `frontend`, `backend`, `release`, `marketing`, `review`, `devops`, or `mixed`.
2. **Check for package needs** — if the task requires new packages, run the Dependency Gate (see above) before spawning coding agents.
3. **For single-domain requests:** spawn the matching subagent with a *fully self-contained brief* — exact file paths, expected behavior, what to return. The orchestrator plans, the subagent executes. **Never** delegate planning ("figure out what to do") — that wastes the subagent's context re-deriving what the orchestrator already knows.
4. **For mixed requests:** decompose into independent subtasks and spawn subagents in parallel (single message, multiple `Agent` tool calls) when there are no cross-dependencies.
5. **Subagents return reports.** The orchestrator handles commits, `CHANGELOG.md` updates, and PR creation. Subagents must not open PRs themselves — this avoids race conditions when multiple agents touch the same branch.
6. **Skills inside subagents.** Each subagent's `.md` declares the skills it must load. The subagent invokes them via the `Skill` tool at the start of its run; the orchestrator doesn't need to specify which skills to use.

### When NOT to delegate

Skip subagent delegation when the task is a single trivial edit (one-line fix, typo, rename) or a pure information question. Spawning a subagent for those just adds a roundtrip.

### Long-report handoff

When a subagent's report would exceed ~80 lines (full `qa-reviewer` audit, deep backend integration write-up, design analysis), the subagent writes the full report to `.claude/scratch/<agent>-<YYYYMMDD-HHMM>.md` and returns only:

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
