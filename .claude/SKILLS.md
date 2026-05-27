# Claude Code Skills

All skills are vendored into [`.claude/skills/`](skills/) and ship with the template — every fork inherits them automatically, no per-machine install. Each subagent in [`.claude/agents/`](agents/) declares which skills it loads.

## Agent → skills matrix

| Agent | Skills it loads |
|---|---|
| `ios-frontend` | `frontend_design`, `ui-ux-pro-max`, `design-for-ai`, `rn-react-native`, `rn-react-best-practices`, `rn-building-ui`, `rn-composition-patterns`, `design-review` *(conditional — only for non-trivial UI changes)* |
| `backend-integrator` | `expo-services`, `react-native-expert`, `typescript-pro`, `rn-data-fetching`, `claude-api` (Anthropic SDK only) |
| `release-manager` | `commit`, `commit-push-pr`, `review`, `verify` |
| `aso-marketing` | `aso-rules`, `ralph-copywriter`, `web-asset-generator` |
| `qa-reviewer` | `review`, `security-review`, `simplify`, `tob-differential-review`, `tob-insecure-defaults`, `tob-supply-chain-risk-auditor` |
| `devops-agent` | `tob-supply-chain-risk-auditor`, `tob-insecure-defaults`, `react-native-expert`, `expo-services` |

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
| `ralph-copywriter` | [muratcankoylan/ralph-wiggum-marketer](https://github.com/muratcankoylan/ralph-wiggum-marketer) | `aso-marketing` |
| `aso-rules` | custom (this repo) | `aso-marketing` |
| `tob-differential-review` | [trailofbits/skills](https://github.com/trailofbits/skills) | `qa-reviewer` |
| `tob-insecure-defaults` | trailofbits/skills | `qa-reviewer` |
| `tob-supply-chain-risk-auditor` | trailofbits/skills | `qa-reviewer` |

## Built-in skills referenced

Claude Code's built-in skills (no install needed, available in every session): `commit`, `commit-push-pr`, `review`, `security-review`, `verify`, `design-review`, `simplify`, `claude-api`, `web-asset-generator`.

## Using skills directly

Invoke any skill from chat with `/skill-name`. When working inside a subagent, the agent loads its declared skills automatically.