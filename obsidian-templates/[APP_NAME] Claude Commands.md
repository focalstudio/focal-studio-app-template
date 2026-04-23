---
tags: [[APP_NAME], claude, reference, commands]
created: YYYY-MM-DD
---

# [APP_NAME] — Claude Commands Reference

A living reference of prompts and patterns for generating useful documents with Claude Code. Add a new entry every time Claude produces a doc worth repeating.

---

## How to use this file

1. Find the relevant section below.
2. Copy the **prompt pattern** and adapt the bracketed placeholders.
3. Paste into the Claude Code chat with the [APP_NAME] project open.

---

## Roadmap & Status Documents

### Full roadmap from codebase analysis
> Produces: `[APP_NAME] Roadmap.md`, `[APP_NAME] Kanban.md`, `[APP_NAME] Dashboard.md`

**Prompt pattern:**
```
Based on the current app and knowing that we're in [closed/open] beta on [Google Play / App Store],
what is missing? Could you make a roadmap and write it as Obsidian documents in
/Users/fperezmartinez/Desktop/Obsidian_Felipe/Projects/[APP_NAME]/?
Produce: a Dashboard, a full Roadmap, and a Kanban board.
```

**What it does:**
- Reads the full `src/` directory, `CHANGELOG.md`, `package.json`, and component files
- Identifies implemented vs missing features
- Groups gaps by priority phase (pre-launch, retention, growth, depth)
- Writes three linked Obsidian files with correct frontmatter, callouts, and Kanban format

**When to re-run:** After each release to refresh priorities.

---

### Refresh the Kanban only (quick update)
**Prompt pattern:**
```
Update the [APP_NAME] Kanban board at
/Users/fperezmartinez/Desktop/Obsidian_Felipe/Projects/[APP_NAME]/[APP_NAME] Kanban.md
to reflect current progress. Move [item name] from [Phase X] to Done.
Add [new item] to [Phase Y] with tag #[priority].
```

---

### Refresh the Dashboard milestones
**Prompt pattern:**
```
Update the [APP_NAME] Dashboard at
/Users/fperezmartinez/Desktop/Obsidian_Felipe/Projects/[APP_NAME]/[APP_NAME] Dashboard.md
to reflect the current version [X.X.X] and milestone dates. The [feature] is now [done/in progress/blocked].
```

---

## Analytics & Beta Review

### PostHog funnel summary
**Prompt pattern:**
```
Based on the PostHog events defined in the [APP_NAME] codebase, what funnel data should I be
reviewing after [N] weeks of closed beta? What drop-off points should I look for and what
actions should I take if I see them?
```

**What it does:** Lists the tracked events, maps them to a conversion funnel, and suggests thresholds.

---

### Beta decision gate review
**Prompt pattern:**
```
We're [N] weeks into closed beta. Here's what I'm seeing in PostHog: [paste key metrics].
Based on our decision gates in the [APP_NAME] Dashboard, should we move to public launch?
What's still blocking?
```

---

## Feature Planning

### Plan a specific feature
**Prompt pattern:**
```
I want to add [feature name] to [APP_NAME]. Read the relevant parts of the codebase and
produce a plan: what files to touch, what branch to create, how it fits the existing
data model, and a manual test checklist.
```

### Produce an Obsidian feature spec
**Prompt pattern:**
```
Write an Obsidian feature spec for [feature name] and save it to
/Users/fperezmartinez/Desktop/Obsidian_Felipe/Projects/[APP_NAME]/[Feature Name].md.
Include: goal, user story, acceptance criteria, files to change, branch name, and test steps.
Use Obsidian callout formatting and checkboxes for all tasks.
```

---

## Release Preparation

### Pre-release checklist doc
**Prompt pattern:**
```
We're about to cut release [X.X.X]. Read the CHANGELOG unreleased section and the codebase,
then write a pre-release checklist as an Obsidian note at
/Users/fperezmartinez/Desktop/Obsidian_Felipe/Projects/[APP_NAME]/Release [X.X.X] Checklist.md.
Include: code tasks, store asset tasks, QA steps, and post-launch monitoring.
```

### Store listing copy
**Prompt pattern:**
```
Based on the current [APP_NAME] feature set, write Play Store listing copy:
short description (≤80 chars), long description (4000 chars max, keyword-rich),
and a bullet list of 5 key features for the "What's new" section for version [X.X.X].
```

---

## Launch Sequencing & Strategy

### Get a launch stage recommendation
**Prompt pattern:**
```
We're currently in [closed/open] beta on Google Play. My goal is to go public as fast as possible.
What's the recommended sequence: open beta → public → monetisation?
What are the minimum blockers for each stage, and what should I defer to avoid delaying the launch?
```

**What it does:**
- Analyses current feature state and missing pieces
- Produces a phased sequence with concrete blockers per stage
- Flags anything that would add unnecessary store/policy overhead before launch (e.g. IAP)

---

## Cloud Backup Architecture

### Design or implement the backup system
**Prompt pattern:**
```
I want to add cloud backup to [APP_NAME]. Read the current storage.ts and localStorage structure,
then implement [enhanced Drive/iCloud export buttons | Firebase Firestore auto-backup with restore code].
Keep it zero-cost for the first [N] users.
```

**Common architecture options:**
- **Short term (zero cost):** Enhanced JSON export with "Save to Google Drive" (Android Share sheet) + "Save to iCloud" (iOS, Capacitor Filesystem → Documents)
- **Medium term (Firebase free tier):** Random 6-char backup code on first launch; auto-save all storage keys to Firestore; "Restore from Cloud" — user enters code

---

## Implementation Prompts (copy-paste ready)

### Sentry crash reporting
**Prompt:**
```
Implement Sentry crash reporting in [APP_NAME] (Capacitor 8 + React + TypeScript).
Context:
- APP_VERSION is exported from src/App.tsx
- VITE_SENTRY_DSN should be read from env, not hardcoded
- No PII, no session replay
Tasks:
1. Install @sentry/capacitor and @sentry/react
2. Initialise in src/main.tsx with dsn, release tagged with APP_VERSION, tracesSampleRate: 0.1
3. Add VITE_SENTRY_DSN= to .env.example
4. Add secret to GitHub Actions build workflow
5. Branch off dev: feat/sentry, update CHANGELOG, open PR targeting dev
Show me the plan before making changes.
```

### In-app rating prompt
**Prompt:**
```
Implement the in-app rating prompt in [APP_NAME].
Context:
- Capacitor 8, React + TypeScript
- Plugin: @capacitor-community/rate-app
- Trigger: successfulActions >= 3 AND streak >= 3 (use ratingService.ts scaffold)
- One-time only — flag stored in localStorage
- On web: silent no-op
Tasks:
1. Install plugin and run npx cap sync
2. Wire maybeRequestRating into the point where a key user action completes
3. Branch off dev: feat/rating-prompt, update CHANGELOG, open PR targeting dev
Show me the plan before making changes.
```

### Open beta promotion checklist
**Prompt:**
```
Help me promote [APP_NAME] from closed beta to open beta on Google Play.
Bundle ID: [APP_ID]
Give me:
1. Exact Play Console steps to promote tracks
2. What to check before publishing (version, release notes, review flags)
3. How to get a shareable open beta URL
4. What to monitor in the first 48 hours (crash rate, onboarding funnel)
5. Threshold to pause and investigate (e.g. crash rate > 2%)
```

---

## Formatting Reference

### Obsidian callout types
```markdown
> [!note] Neutral info
> [!tip] Positive suggestion
> [!warning] Caution needed
> [!danger] Critical / blocking
> [!info] Background context
```

### Status icons (use consistently)
| Symbol | Meaning |
|---|---|
| ✅ | Done / shipped |
| ❌ | Missing / not started |
| ⏳ | Planned / in progress |
| ⚠️ | Partial / needs attention |
| 🔴 | Critical priority |
| 🟠 | High priority |
| 🟡 | Medium priority |
| 🟢 | Later / nice to have |
| ⬜ | Deferred indefinitely |

### YAML frontmatter template
```yaml
---
tags: [[APP_NAME], <doc-type>]
created: YYYY-MM-DD
version: X.X.X
---
```

---

*Add a new section to this file each time Claude produces a reusable document or command pattern.*
