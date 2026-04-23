# CLAUDE.md

This file gives project-specific instructions for working on **[APP_NAME]** in VS Code with the Claude extension.

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
2. Bump version in `package.json` and `src/App.tsx` (`APP_VERSION`).
3. Move `## [Unreleased]` in `CHANGELOG.md` to `## [x.x.x] — YYYY-MM-DD`.
4. Open a PR: `release/x.x.x` → `main`.
5. After merge, tag: `git tag vx.x.x` and push the tag.
6. Open a second PR: `release/x.x.x` → `dev` (to keep dev in sync).
7. Verify dev mode is off: the `DEV_MODE_KEY` in `App.tsx` is scoped to the version, so it resets automatically — but double-check before store submission.

## Git safety rules
- Never commit directly to `main` or `dev`.
- Never merge to `main` automatically — always via PR.
- Never delete branches unless explicitly asked.
- Before making edits, check `git status` and warn about uncommitted local changes.
- If the work is risky or broad, propose a short plan before changing code.
- Prefer atomic commits.
- Always use `gh pr create` (full path `/opt/homebrew/bin/gh` if `gh` is not in PATH).

## Coding style
- Keep functions and components small.
- Prefer readable code over clever code.
- Reuse existing patterns in the repository.
- Avoid unnecessary dependencies.
- Avoid large-scale refactors unless asked.
- Keep platform-specific code isolated when possible.
- When fixing bugs, explain the root cause briefly.

## Mobile app guidance
Assume [APP_NAME] is intended to ship and iterate like a real product.

- Prefer cross-platform-safe changes where possible.
- Keep Android and iOS differences explicit and minimal.
- Preserve build stability.
- If a feature affects release or store readiness, call that out clearly.
- If adding a new feature, suggest whether it belongs in shared logic, UI layer, or platform-specific code.

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
Dev mode (the 5-tap title toggle) is available on all branches and build types. It is **off by default** and protected by a version-scoped localStorage key (`DEV_MODE_KEY` in `App.tsx`).

- Dev mode is enabled by tapping the app header title 5 times within 3 seconds.
- When `APP_VERSION` is bumped, `DEV_MODE_KEY` changes automatically — resetting any stored dev mode state on the user's device.
- This means a fresh install or version update always starts with dev mode off, which is the primary safeguard for store submissions.
- Do not add build-time guards (`import.meta.env.DEV`) — these break dev mode in Capacitor device builds on dev/feature branches.

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
- `feat/add-onboarding-screen`
- `fix/notification-timing`
- `refactor/storage-layer`
- `docs/setup-instructions`

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

Before creating an issue, run `gh label list --repo [GITHUB_REPO]` to confirm labels exist.

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
