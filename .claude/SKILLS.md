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

## Picking among overlapping skills

Some conditional skills cover adjacent ground. Rather than merge them (real content, real
authors, higher risk to cut), pick by task shape:

**RN/React performance trio** (`rn-react-native`, `rn-react-best-practices`, `react-native-expert`):
- **Building or wiring** something new — navigation hierarchies, native modules, platform-specific
  iOS/Android code, Expo SDK config — reach for `react-native-expert` first; it's the
  implementation-focused specialist of the three.
- **Diagnosing or optimizing** an existing screen's runtime performance — FPS, TTI, list
  rendering, animations, bundle size — reach for `rn-react-native` first; it's the broadest,
  most RN/Expo-native guide (Callstack profiling + Vercel patterns combined) of the three.
- **Pure React component/rendering-pattern theory** with no RN-specific concern — reach for
  `rn-react-best-practices` only as a secondary check. It's Vercel's React/Next.js guidance, not
  RN-specific, so some of its advice (Next.js bundling, server components) doesn't apply here.

**UI/UX design trio** (`frontend_design`, `ui-ux-pro-max`, `design-for-ai`):
- `ui-ux-pro-max` is the primary reference for RN screens — it's the only one of the three that
  explicitly covers React Native as a target stack, with a full style/palette/font-pairing/UX
  catalog to pull from.
- `frontend_design` is web/artifact-oriented (its own examples are websites, landing pages,
  HTML/CSS) — use it as a supplementary source only, e.g. when porting a web-style pattern or
  working in an artifact rather than the app itself.
- `design-for-ai` stays scoped to its documented trigger: unspecced design calls needing visual
  hierarchy/typography/spacing/color fundamentals, not a full component build.

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