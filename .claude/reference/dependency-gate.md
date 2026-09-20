# Dependency Gate

> Extracted from `.claude/CLAUDE.md` to keep the always-loaded instructions small.
> Read this file when a task needs a package that is not already in `package.json`, or when a
> subagent returns a `PACKAGES_NEEDED` block.

---

Every task that requires new npm packages goes through the **Dependency Gate** before any code is written. This keeps the user in control of what enters the project and ensures the coding workflow runs uninterrupted after approval.

### Orchestrator pre-flight checklist

When the user's request implies new packages:

1. Identify the packages needed (check `package.json` — only flag what's missing).
2. Spawn `devops-agent` in pre-flight mode with the package list.
3. `devops-agent` assesses risk and surfaces a report to the user.
4. User approves / rejects / substitutes.
5. `devops-agent` installs approved packages and returns an `INSTALLATION_RECEIPT`.
6. Spawn the coding subagent(s) with the receipt attached: "Pre-approved packages: X, Y, Z (installed)."

### Mid-run discovery

If a coding subagent discovers an unexpected package need mid-run:

1. The subagent **stops** and returns a `PACKAGES_NEEDED` block + `STATUS: awaiting_approval`.
2. The orchestrator forwards to `devops-agent`.
3. After the receipt, the orchestrator resumes the subagent with "Package X is now installed."

### PACKAGES_NEEDED format

```
PACKAGES_NEEDED:
  - package: @supabase/supabase-js
    reason: Supabase JS client for auth and database access
  - package: expo-camera
    reason: Native camera access for QR scan feature

STATUS: awaiting_approval
```

### devops-agent invocation modes

| Mode | Trigger | Who calls it |
|---|---|---|
| Pre-flight | Orchestrator predicts packages before coding starts | Orchestrator |
| Mid-run discovery | Subagent returns `PACKAGES_NEEDED` block | Orchestrator (relays from subagent) |
| Explicit user request | "use the devops agent to install X" | Orchestrator (direct) |

**`devops-agent` is never auto-spawned for non-package tasks.** It is a leaf agent — it does not spawn other agents.

---
