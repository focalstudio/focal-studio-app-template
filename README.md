# [APP_NAME]

> [APP_TAGLINE]

A Focal Studio app. Built with React + TypeScript + Vite + Capacitor.

---

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Available scripts

| Script | What it does |
|--------|-------------|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and bundle for production |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run ESLint |
| `npm test` | Run Vitest unit tests |
| `npm run gen:icons` | Generate Android launcher icons from `public/icon.png` |
| `npm run normalize-image` | Pad an image to 1024×1024 transparent PNG |

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React 19 |
| Language | TypeScript 5.9 |
| Build | Vite 7 |
| Mobile bridge | Capacitor 8 |
| Testing | Vitest |
| Analytics | PostHog (EU-hosted, optional) |
| Crash reporting | Sentry (optional) |

---

## Project structure

```
src/
  App.tsx              # App shell — tabs, theme, dev mode toggle
  main.tsx             # Entry point — Sentry + analytics init
  App.css              # CSS design tokens (brand colors, radii, shadows)
  index.css            # Global reset
  constants.ts         # App identity (APP_NAME, APP_ID, APP_COLOR)
  types.ts             # Shared TypeScript types
  analytics.ts         # PostHog event helpers
  storage.ts           # localStorage helpers + export/import
  haptics.ts           # Capacitor haptic feedback
  notificationService.ts  # Local notification scheduling
  ratingService.ts     # In-app review prompt
  helpers.ts           # Pure utility functions
  theme.ts             # Design token constants (TS-side)
  __tests__/           # Vitest unit tests
```

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_POSTHOG_KEY` | No | PostHog analytics (disabled if empty) |
| `VITE_SENTRY_DSN` | No | Sentry crash reporting (disabled if empty) |

---

## Android development

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full Android setup guide.

Quick start (after `npx cap add android` has been run):

```bash
npm run build
npx cap sync
# Open android/ in Android Studio and run, or:
cd android && ./gradlew assembleDebug
```

---

## Privacy policy

[https://fpmartinez10.github.io/privacy-policy.html](https://fpmartinez10.github.io/privacy-policy.html)

---

## License

© 2026 Focal Studio. All rights reserved.
