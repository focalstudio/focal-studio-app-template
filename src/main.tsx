import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/capacitor'
import * as SentryReact from '@sentry/react'
import './index.css'
import App, { APP_VERSION } from './App.tsx'
import { initAnalytics, trackAppError } from './analytics'

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined

if (SENTRY_DSN) {
  Sentry.init(
    {
      dsn: SENTRY_DSN,
      release: `[APP_SLUG]@${APP_VERSION}`,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      beforeSend(event) {
        delete event.user
        return event
      },
    },
    SentryReact.init
  )
}

initAnalytics()

window.addEventListener("error", (e) => {
  trackAppError(e.message, e.filename)
})
window.addEventListener("unhandledrejection", (e) => {
  trackAppError(String(e.reason))
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
