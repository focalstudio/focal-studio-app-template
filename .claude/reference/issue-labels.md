# GitHub issue labels

> Extracted from `.claude/CLAUDE.md` to keep the always-loaded instructions small.
> Read this file when creating or triaging GitHub issues.

Always apply labels when creating issues. Use `gh issue create --label "..."` with comma-separated values.

Before creating an issue, run `gh label list --repo [GITHUB_REPO]` to confirm labels exist and discover any new ones. Update this section if new labels appear.

**The label set lives in [`.github/labels.tsv`](../../.github/labels.tsv)** — one manifest, applied by `scripts/init.sh` at bootstrap. If `gh label list` comes back short (an app generated before #127 landed only had four labels), re-apply it:

```bash
bash scripts/sync-labels.sh                    # current repo
bash scripts/sync-labels.sh --repo owner/name  # any repo
```

It is idempotent — existing labels are updated in place, so it is safe to re-run. Adding a label means adding a row to the manifest *and* a row to the tables below.

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

### Workflow labels (applied to PRs, not issues)
| Label | What it does |
|-------|--------------|
| `e2e` | Runs the Maestro E2E suite on a PR to `dev`. PRs to `main` run it unconditionally, so the label is only needed when you want the pre-merge signal on a `dev` PR — see [.github/workflows/maestro-e2e.yml](../../.github/workflows/maestro-e2e.yml). Adding it to an already-open PR re-triggers the run. |

The remaining GitHub defaults (`duplicate`, `good first issue`, `help wanted`, `invalid`, `wontfix`) exist for triage and are not part of the type/priority/milestone convention.

### Typical combinations
- New feature for next minor release → `enhancement`, `medium`
- Crash / data loss → `bug`, `critical`
- Docs update → `documentation`, `low`
- CI / tooling fix → `chore`, `medium`
