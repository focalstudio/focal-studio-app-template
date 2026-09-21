# Claude Code Skills

All skills are vendored into [`.claude/skills/`](skills/) and ship with the template — every fork inherits them automatically, no per-machine install. Each subagent in [`.claude/agents/`](agents/) declares which skills it loads.

## Loading is conditional by default

**A skill costs context every time it loads.** Agents therefore load skills by *task shape*, not on every run — a one-line spacing fix should not pull in the design-system stack, and a 30-line diff should not pull in the full audit stack.

The table below lists what an agent *may* load. The agent's own `.md` holds the routing conditions and is authoritative. Only the skills marked **always** load unconditionally.

## Agent → skills matrix

**Each agent's own `.md` holds its routing conditions and is authoritative.** A central copy of
that table was maintained here and went out of date the moment an agent changed — so this is an
index of where to look, not a second source of truth.

| Agent | Skills it may load |
|---|---|
| `ios-frontend` | `frontend_design`, `ui-ux-pro-max`, `rn-building-ui`, `rn-react-native`, `rn-react-best-practices`, `rn-composition-patterns`, `design-for-ai`, `design-review` |
| `backend-integrator` | `expo-services` (always), `react-native-expert`, `rn-data-fetching`, `typescript-pro`, `claude-api` |
| `qa-reviewer` | `review` + `security-review` (always), `tob-differential-review`, `tob-insecure-defaults`, `tob-supply-chain-risk-auditor`, `simplify` |
| `devops-agent` | `tob-supply-chain-risk-auditor` + `tob-insecure-defaults` (always), `react-native-expert`, `expo-services` |
| `release-manager` | `parallel-release` (first), `commit`, `commit-push-pr`, `review`, `verify` |
| `aso-marketing` | `aso-rules` (always), `ralph-copywriter`, `web-asset-generator` |
| `app-bootstrapper` | `ralph-copywriter`, `aso-rules` |
| `test-engineer` | none by default; `react-native-expert` on a native-module test failure |


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