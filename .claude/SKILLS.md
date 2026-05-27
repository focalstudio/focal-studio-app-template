# Claude Code Skills

Skills are stored in [`.claude/skills/`](skills/) (committed with the template) plus a small set of user-level skills in `~/.claude/skills/` (install once per machine). Each subagent in [`.claude/agents/`](agents/) and `~/.claude/agents/` declares which skills it loads.

## Agent → skills matrix

| Agent | Location | Skills it loads |
|---|---|---|
| `ios-frontend` | repo | `frontend_design`, `ui-ux-pro-max`, `design-for-ai`, `rn-react-native`, `rn-react-best-practices`, `rn-building-ui`, `rn-composition-patterns`, `design-review` |
| `backend-integrator` | repo | `expo-services`, `react-native-expert`, `typescript-pro`, `rn-data-fetching`, `claude-api` (Anthropic SDK only) |
| `release-manager` | repo | `commit`, `commit-push-pr`, `review`, `verify` |
| `aso-marketing` | user | `aso-rules`, `ralph-copywriter`, `web-asset-generator` |
| `qa-reviewer` | user | `review`, `security-review`, `simplify`, `tob-differential-review`, `tob-insecure-defaults`, `tob-supply-chain-risk-auditor` |

## Repo-vendored skills

These ship inside the template — every fork inherits them automatically.

| Skill | Source | Used by |
|---|---|---|
| `frontend_design` | [anthropics public skill](https://github.com/anthropics) | `ios-frontend` |
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

## User-level skills (install once per machine)

Install into `~/.claude/skills/`. The user-level agents (`aso-marketing`, `qa-reviewer`) depend on these.

| Skill | Source | Used by |
|---|---|---|
| `ralph-copywriter` | [muratcankoylan/ralph-wiggum-marketer](https://github.com/muratcankoylan/ralph-wiggum-marketer) (`skills/copywriter/`) | `aso-marketing` |
| `tob-differential-review` | [trailofbits/skills](https://github.com/trailofbits/skills) (`plugins/differential-review/`) | `qa-reviewer` |
| `tob-insecure-defaults` | trailofbits/skills (`plugins/insecure-defaults/`) | `qa-reviewer` |
| `tob-supply-chain-risk-auditor` | trailofbits/skills (`plugins/supply-chain-risk-auditor/`) | `qa-reviewer` |
| `aso-rules` | custom (this repo's author) | `aso-marketing` |

Install commands:

```bash
# Public skills
git clone --depth 1 https://github.com/muratcankoylan/ralph-wiggum-marketer.git /tmp/rwm \
  && cp -r /tmp/rwm/skills/copywriter ~/.claude/skills/ralph-copywriter

git clone --depth 1 https://github.com/trailofbits/skills.git /tmp/tob \
  && for s in differential-review insecure-defaults supply-chain-risk-auditor; do \
       cp -r /tmp/tob/plugins/$s ~/.claude/skills/tob-$s; \
     done

# Custom skills (copy from this repo's docs or rebuild from the SKILL.md tracked in user-level agents docs)
# `aso-rules` SKILL.md is included with the user-level `aso-marketing` agent setup.
```

## Built-in skills referenced

Claude Code's built-in skills (no install needed): `commit`, `commit-push-pr`, `review`, `security-review`, `verify`, `design-review`, `simplify`, `claude-api`.

## Using skills directly

You can invoke any skill from chat with `/skill-name` — but when working inside an agent, the agent loads its declared skills automatically.