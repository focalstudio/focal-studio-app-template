# Claude Code Skills

This file documents which Claude Code skills are useful for this project and how to install them.

Skills are stored in `.claude/skills/` (gitignored — personal to your environment).

## Recommended skills

| Skill | Purpose | How to install |
|-------|---------|----------------|
| `frontend_design` | Generate polished component UI | Copy from WildFocus `.claude/skills/` or regenerate with `/frontend_design` |
| `ui-ux-pro-max` | Design system guidance, color palettes, UX guidelines | Available via Claude Code skill registry |
| `commit-push-pr` | One-command commit → push → PR to dev | Available via Claude Code skill registry |
| `commit` | Structured git commit with co-author | Available via Claude Code skill registry |
| `init` | Generate a CLAUDE.md from scratch for a new project | Available via Claude Code skill registry |
| `review` | Review a pull request | Available via Claude Code skill registry |
| `security-review` | Security review of pending changes | Available via Claude Code skill registry |

## Skills from WildFocus (copy if relevant)

These skills were developed during WildFocus and may be reusable:

- **`react-native-skills`** — Capacitor-specific patterns, mobile-safe React hooks
- **`skill_creator`** — Creates new Claude Code skills

Copy them from `/Users/fperezmartinez/Desktop/WildFocus/.claude/skills/` if they exist.

## Using skills

Invoke a skill in the Claude Code chat with `/skill-name`.

To see all available skills: run `/help` in Claude Code.

## Notes

- Skills in `.claude/skills/` are gitignored (personal to your dev environment).
- `settings.local.json` is also gitignored (copy from `settings.local.json.template` on setup).
- To share a skill across projects, consider publishing it to the Focal Studio shared config.
