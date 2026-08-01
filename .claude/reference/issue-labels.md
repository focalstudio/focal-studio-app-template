# GitHub issue labels

> Extracted from `.claude/CLAUDE.md` to keep the always-loaded instructions small.
> Read this file when creating or triaging GitHub issues.

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
