# Permission model

> Extracted from `.claude/CLAUDE.md` to keep the always-loaded instructions small.
> Read this file when a command is unexpectedly blocked or prompts, or when changing what
> Claude may run unattended. The rules themselves are enforced by `.claude/settings.json`,
> not by remembering this page.

---

This repo ships a **three-layer permission system** so Claude can work autonomously without prompts for routine operations, while hard-blocking genuinely destructive commands.

### Layer 1 — Project shared (`.claude/settings.json`, tracked)
Committed to git → propagates automatically to every repo cloned from this template. Contains:
- **Allowlist:** all safe dev operations (git workflow, npm project-scoped, expo, gh CLI, shell utilities, WebFetch to dev domains)
- **Denylist (always blocked, no override):**
  - `git push --force` / `git push -f` — no remote history rewrites
  - `git push origin main` — no direct push to main; always via PR
  - `rm -rf` / `rm -r` — no recursive deletes
  - `sudo` — no privilege escalation
- **Hooks:** a `Stop` hook running `.claude/hooks/wrap-reminder.sh` — blocks a session from stopping with unwrapped commits (see "Session workflow" above). Requires `jq`; no-ops silently if it's absent.

### Layer 2 — Project personal (`.claude/settings.local.json`, gitignored)
Your machine-specific overrides. Copy `.claude/settings.local.json.template` to `.claude/settings.local.json` to activate. Use this to add permissions that are personal (e.g., custom Homebrew paths) or that you explicitly trust `devops-agent` to use autonomously (e.g., `brew install`, `npm install -g`).

### Layer 3 — Global (`~/.claude/settings.json`, user home)
Applies to all projects. Lowest specificity — project settings take precedence.

### What "neither allow nor deny" means
If a command is not in the allowlist AND not in the denylist, Claude Code **prompts the user**. This is intentional for extended operations like `brew install`, `pip install`, and `npm install -g` — they prompt, which gives the user a second confirmation after the devops-agent's risk report.

---
