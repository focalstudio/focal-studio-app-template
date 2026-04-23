---
tags: [[APP_NAME], dashboard, launch]
created: YYYY-MM-DD
version: 0.1.0
---

# [APP_NAME] — Launch Dashboard

> [!info] Purpose
> Single source of truth for launch readiness. Update after every release or major decision.

---

## Current Status

| Dimension | Status | Notes |
|---|---|---|
| Version | `0.1.0` | |
| Track | Private / Closed Beta / Open Beta / Public | |
| Platform | Android / iOS / Web | |
| Beta testers | 0 | |
| Crash rate (7-day) | — | Check Android Vitals / Sentry |
| D1 retention | — | PostHog |
| D7 retention | — | PostHog |

---

## Phase Gates

### Gate 1 — Closed Beta Launch
- [ ] Core feature loop working end-to-end
- [ ] Analytics events firing (PostHog)
- [ ] Crash reporting live (Sentry)
- [ ] In-app rating prompt implemented
- [ ] Privacy policy live at `https://fpmartinez10.github.io/privacy-policy.html`
- [ ] Store listing copy written
- [ ] At least 1 real tester using the app

**Decision:** Move to open beta when all boxes checked.

---

### Gate 2 — Open Beta Launch
- [ ] Crash rate < 2% (Android Vitals, 7-day)
- [ ] D1 retention ≥ 30%
- [ ] No P0 bugs open
- [ ] Store screenshots and feature graphic ready
- [ ] `[APP_SLUG]` page on Focal Studio website live

**Decision:** Move to public when all boxes checked.

---

### Gate 3 — Public v1.0
- [ ] D7 retention ≥ 20%
- [ ] Rating ≥ 4.0 stars (minimum 10 ratings)
- [ ] All core flows tested on Android + iOS (or web PWA)
- [ ] CHANGELOG entries up to date
- [ ] Version bumped to `1.0.0` in `src/App.tsx`, `package.json`, `android/app/build.gradle`

**Decision:** Ship v1.0 publicly.

---

## Key Decisions Log

| Date | Decision | Rationale |
|---|---|---|
| YYYY-MM-DD | Initial scaffold from focal-studio-app-template | — |

---

## Milestone Timeline

| Milestone | Target | Actual |
|---|---|---|
| Closed beta | YYYY-MM-DD | — |
| Open beta | YYYY-MM-DD | — |
| Public v1.0 | YYYY-MM-DD | — |
| v1.x (retention features) | YYYY-MM-DD | — |

---

## Links

- GitHub: `https://github.com/[GITHUB_REPO]`
- Play Store: `https://play.google.com/store/apps/details?id=[APP_ID]`
- PostHog: `https://eu.posthog.com`
- Sentry: `https://sentry.io`
- Kanban: [[APP_NAME] Kanban]]
- Roadmap: [[APP_NAME] Roadmap]]
