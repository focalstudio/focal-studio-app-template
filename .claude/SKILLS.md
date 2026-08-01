# Claude Code Skills

All skills are vendored into [`.claude/skills/`](skills/) and ship with the template — every fork inherits them automatically, no per-machine install. Each subagent in [`.claude/agents/`](agents/) declares which skills it loads.

## Loading is conditional by default

**A skill costs context every time it loads.** Agents therefore load skills by *task shape*, not on every run — a one-line spacing fix should not pull in the design-system stack, and a 30-line diff should not pull in the full audit stack.

The table below lists what an agent *may* load. The agent's own `.md` holds the routing conditions and is authoritative. Only the skills marked **always** load unconditionally.

## Agent → skills matrix

| Agent | Always | Conditional |
|---|---|---|
| `ios-frontend` | — | `frontend_design`, `ui-ux-pro-max`, `rn-building-ui` (new screen / restyle) · `rn-react-native`, `rn-react-best-practices` (perf) · `rn-composition-patterns` (component API) · `design-for-ai` (unspecced design calls) · `design-review` (new or restructured screen) |
| `backend-integrator` | `expo-services` | `react-native-expert` (native module) · `rn-data-fetching` (network) · `typescript-pro` (non-obvious types) · `claude-api` (Anthropic SDK) |
| `test-engineer` | — | `react-native-expert` (native-module mock failures only) |
| `release-manager` | `parallel-release` | `commit`, `commit-push-pr`, `review`, `verify` |
| `aso-marketing` | `aso-rules` | `ralph-copywriter` (full descriptions / voice shift) · `web-asset-generator` (OG images) |
| `qa-reviewer` | `review`, `security-review` | `tob-differential-review` (>~200 lines or >5 files) · `tob-insecure-defaults` (auth/storage/network/config) · `tob-supply-chain-risk-auditor` (`package.json` changed) · `simplify` (new module/abstraction) |
| `devops-agent` | `tob-supply-chain-risk-auditor`, `tob-insecure-defaults` | `react-native-expert`, `expo-services` (RN/Expo-ecosystem packages) |

`test-engineer` deliberately loads nothing by default — the harness conventions live in [`docs/testing.md`](../docs/testing.md), which it reads directly.

## Model and effort per agent

Tiered by how expensive a mistake is, not by how hard the task feels. Declared in each agent's frontmatter.

| Agent | Model | Effort |
|---|---|---|
| `qa-reviewer` | opus | high |
| `devops-agent` | opus | medium |
| `backend-integrator` | sonnet | high |
| `ios-frontend` | sonnet | medium |
| `test-engineer` | sonnet | medium |
| `app-bootstrapper` | sonnet | medium |
| `release-manager` | sonnet | low |
| `aso-marketing` | haiku | low |

## Vendored skills

| Skill | Source | Primary user |
|---|---|---|
| `frontend_design` | public skill | `ios-frontend` |
| `ui-ux-pro-max` | public skill | `ios-frontend` |
| `design-for-ai` | public skill | `ios-frontend` |
| `rn-react-native` | [gigs-slc/react-native-skills](https://github.com/gigs-slc/react-native-skills) | `ios-frontend` |
| `rn-react-best-practices` | gigs-slc/react-native-skills | `ios-frontend` |
| `rn-building-ui` | gigs-slc/react-native-skills | `ios-frontend` |
| `rn-composition-patterns` | gigs-slc/react-native-skills | `ios-frontend` |
| `rn-data-fetching` | gigs-slc/react-native-skills | `backend-integrator` |
| `rn-upgrading-expo` | gigs-slc/react-native-skills | situational |
| `rn-dev-client` | gigs-slc/react-native-skills | situational |
| `react-native-expert` | [jeffallan/claude-skills](https://github.com/jeffallan/claude-skills) | `backend-integrator` |
| `typescript-pro` | jeffallan/claude-skills | `backend-integrator` |
| `expo-services` | custom (this repo) | `backend-integrator` |
| `parallel-release` | custom (this repo) | `release-manager` |
| `ralph-copywriter` | [muratcankoylan/ralph-wiggum-marketer](https://github.com/muratcankoylan/ralph-wiggum-marketer) | `aso-marketing` |
| `aso-rules` | custom (this repo) | `aso-marketing` |
| `tob-differential-review` | [trailofbits/skills](https://github.com/trailofbits/skills) | `qa-reviewer` |
| `tob-insecure-defaults` | trailofbits/skills | `qa-reviewer` |
| `tob-supply-chain-risk-auditor` | trailofbits/skills | `qa-reviewer` |

## Built-in skills referenced

Claude Code's built-in skills (no install needed, available in every session): `commit`, `commit-push-pr`, `review`, `security-review`, `verify`, `design-review`, `simplify`, `claude-api`, `web-asset-generator`.

## Using skills directly

Invoke any skill from chat with `/skill-name`. When working inside a subagent, the agent loads its declared skills automatically.