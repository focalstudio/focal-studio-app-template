# Multi-agent workflow

> Extracted from `.claude/CLAUDE.md` to keep the always-loaded instructions small.
> Read this file when planning how to split a request across subagents, or when a subagent's
> report is long enough to need the hand-off convention.

---

All eight specialist subagents live in [.claude/agents/](../agents/) and ship with the template — no per-machine install. The main Claude Code session (running Opus) acts as the **orchestrator** — it never does all the work itself, it delegates.

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

Model/effort per agent and which skills each agent loads — and the conditions under which it loads them — is in [.claude/SKILLS.md](../SKILLS.md), the single source of truth for both. Do not duplicate that data here.

### Bootstrap trigger

When the user says any of the following, classify as `bootstrap` and **spawn `app-bootstrapper` immediately** — no pre-planning needed, the agent owns the full workflow:

- "bootstrap a new app"
- "start a new app from the template"
- "I have an idea for an app: …"
- "initialise / initialize a new project"
- "set up [app name]" (from a fresh clone)

Pass the verbatim user message as the brief. The agent handles all Q&A and execution.

**New repos are private, and the LICENSE follows.** `scripts/init.sh` creates the GitHub repo
private and installs `templates/licenses/private.txt` — the variant that calls the source
confidential. `--public` flips both from one switch, and is the only supported way to make a
public app: the two settings are coupled precisely so they cannot drift apart, which is what
happened to this template's own LICENSE. Pass it only on an explicit request.

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
