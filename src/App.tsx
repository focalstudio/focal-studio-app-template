import { useEffect, useRef, useState } from "react";
import * as Sentry from "@sentry/capacitor";
import "./App.css";
import { Capacitor } from "@capacitor/core";

import type { AppView, Theme, NotificationPrefs } from "./types";
import { APP_NAME } from "./constants";
import { loadTheme, saveTheme, loadNotificationPrefs, saveNotificationPrefs } from "./storage";
import { createNotificationChannel, rescheduleNotifications } from "./notificationService";
import { isAnalyticsEnabled, setAnalyticsEnabled, trackTabViewed, trackTabLeft } from "./analytics";
import { hapticTap } from "./haptics";

// Bump this string on every release. The DEV_MODE_KEY below is scoped to it,
// so dev mode resets automatically when users receive a new version — preventing
// accidental dev mode in a store build.
export const APP_VERSION = "0.1.0";
const DEV_MODE_KEY = `[APP_SLUG]_dev_mode_v${APP_VERSION}`;

const TAB_ORDER: Record<AppView, number> = { home: 0, settings: 1 };

export default function App() {
  const [analyticsEnabled, setAnalyticsEnabledState] = useState(() => isAnalyticsEnabled());

  // ── Theme ──────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState<Theme>(() => {
    const t = loadTheme();
    const root = document.documentElement;
    if (t === "device") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", t);
    return t;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "device") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  // ── Notifications ──────────────────────────────────────────────────────
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(
    () => loadNotificationPrefs(),
  );

  function handleNotificationPrefsChange(prefs: NotificationPrefs) {
    setNotificationPrefs(prefs);
    saveNotificationPrefs(prefs);
  }

  useEffect(() => {
    createNotificationChannel();
    rescheduleNotifications(notificationPrefs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    rescheduleNotifications(notificationPrefs);
  }, [notificationPrefs]);

  const rescheduleRef = useRef(() => {});
  rescheduleRef.current = () => rescheduleNotifications(notificationPrefs);
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === "visible") rescheduleRef.current();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tab navigation ─────────────────────────────────────────────────────
  const [view, setViewRaw] = useState<AppView>("home");
  const [slideDir, setSlideDir] = useState<"left" | "right">("left");
  const tabEnteredAtRef = useRef<number>(Date.now());

  function setView(v: AppView) {
    const dwell = Math.round((Date.now() - tabEnteredAtRef.current) / 1000);
    trackTabLeft(view, dwell);
    tabEnteredAtRef.current = Date.now();
    setSlideDir(TAB_ORDER[v] > TAB_ORDER[view] ? "left" : "right");
    setViewRaw(v);
    trackTabViewed(v);
  }

  // ── Dev mode (5-tap toggle) ────────────────────────────────────────────
  // Tap the header title 5 times within 3 seconds to toggle dev mode.
  // Scoped to APP_VERSION so it resets on every new release build.
  const [devMode, setDevMode] = useState(() => localStorage.getItem(DEV_MODE_KEY) === "true");
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const devTapCount = useRef(0);
  const devTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const devLastTap = useRef(0);

  function handleDevTap(e: React.MouseEvent | React.TouchEvent) {
    // On Android WebView, touch fires both onTouchEnd and onClick — skip the
    // synthetic click that follows within 300ms of a real touch.
    const now = Date.now();
    if (e.type === "click" && now - devLastTap.current < 300) return;
    if (e.type === "touchend") devLastTap.current = now;

    devTapCount.current += 1;
    if (devTapTimer.current) clearTimeout(devTapTimer.current);
    devTapTimer.current = setTimeout(() => { devTapCount.current = 0; }, 3000);
    if (devTapCount.current >= 5) {
      devTapCount.current = 0;
      setDevMode(prev => {
        const next = !prev;
        localStorage.setItem(DEV_MODE_KEY, String(next));
        return next;
      });
    }
  }

  return (
    <div className="app-shell">
      {/* ── Header ── */}
      <header className="app-header">
        <span
          className="app-header-title"
          onClick={handleDevTap}
          onTouchEnd={handleDevTap}
          style={{ cursor: "default", userSelect: "none" }}
        >
          {APP_NAME}
        </span>
        {devMode && (
          <div
            onClick={() => setDevPanelOpen(v => !v)}
            style={{
              position: "fixed", top: 8, right: 8,
              background: "#f00", color: "#fff",
              fontSize: 10, fontWeight: 700,
              padding: "2px 6px", borderRadius: 4,
              zIndex: 9999, cursor: "pointer",
            }}
          >
            DEV
          </div>
        )}
        {devMode && devPanelOpen && (
          <div style={{
            position: "fixed", top: 30, right: 8, zIndex: 9998,
            background: "var(--bg-card)", border: "1.5px solid var(--border-medium)",
            borderRadius: 10, padding: 14, minWidth: 200,
            boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
            display: "flex", flexDirection: "column", gap: 12,
          }}>
            <div style={{ fontWeight: 800, fontSize: 13 }}>Dev Tools</div>
            <button
              onClick={() => Sentry.captureException(new Error(`sentry test — [APP_NAME] dev`))}
              style={{
                padding: "6px 12px", fontSize: 12, fontWeight: 700, borderRadius: 6,
                background: "transparent", color: "#f00",
                border: "1.5px solid #f00", cursor: "pointer",
              }}
            >
              Send Test Error to Sentry
            </button>
            <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
              v{APP_VERSION} · {Capacitor.getPlatform()}
            </div>
          </div>
        )}
      </header>

      {/* ── Tab content ── */}
      <main className="app-content">
        <div key={view} className={`tab-slide-${slideDir}`}>

          {/* HOME — replace with your app's main screen */}
          {view === "home" && (
            <div className="tab-pane">
              <div className="card">
                <h2 style={{ margin: 0, marginBottom: 8 }}>Welcome to {APP_NAME}</h2>
                <p style={{ margin: 0, color: "var(--text-secondary)" }}>
                  Replace this with your app's home screen.
                </p>
              </div>
            </div>
          )}

          {/* SETTINGS */}
          {view === "settings" && (
            <div className="tab-pane">
              <div className="settings-section">
                <div className="settings-section-title">Appearance</div>
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div className="settings-row" style={{ cursor: "default" }}>
                    <div className="settings-row-icon">{theme === "dark" ? "🌙" : "☀️"}</div>
                    <div className="settings-row-body">
                      <div className="settings-row-label">Theme</div>
                    </div>
                    <div
                      className={`ios-toggle${theme === "dark" ? " ios-toggle--on" : ""}`}
                      role="switch"
                      aria-checked={theme === "dark"}
                      aria-label="Toggle dark mode"
                      onClick={() => {
                        const next: Theme = theme === "dark" ? "light" : "dark";
                        setTheme(next);
                        saveTheme(next);
                        hapticTap();
                      }}
                    >
                      <div className="ios-toggle-thumb" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-section-title">Privacy</div>
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div className="settings-row" style={{ cursor: "default" }}>
                    <div className="settings-row-icon">📊</div>
                    <div className="settings-row-body">
                      <div className="settings-row-label">Analytics</div>
                      <div className="settings-row-sub">Share anonymous usage data to help improve the app</div>
                    </div>
                    <div
                      className={`ios-toggle${analyticsEnabled ? " ios-toggle--on" : ""}`}
                      role="switch"
                      aria-checked={analyticsEnabled}
                      aria-label="Toggle analytics"
                      onClick={() => {
                        const next = !analyticsEnabled;
                        setAnalyticsEnabledState(next);
                        setAnalyticsEnabled(next);
                        hapticTap();
                      }}
                    >
                      <div className="ios-toggle-thumb" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="settings-section">
                <div className="settings-section-title">Support</div>
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div className="settings-row" onClick={() => {
                    hapticTap();
                    const platform = Capacitor.getPlatform();
                    if (platform === "android") {
                      window.open(`market://details?id=[APP_ID]`, "_system");
                    } else if (platform === "ios") {
                      window.open("itms-apps://itunes.apple.com/app/idAPP_STORE_ID?action=write-review", "_system");
                    } else {
                      window.open(`https://play.google.com/store/apps/details?id=[APP_ID]&reviewId=0`, "_system");
                    }
                  }}>
                    <div className="settings-row-icon">⭐</div>
                    <div className="settings-row-body">
                      <div className="settings-row-label">Rate us</div>
                      <div className="settings-row-sub">Enjoying the app? Leave a review</div>
                    </div>
                    <div className="settings-row-chevron">›</div>
                  </div>
                  <div className="settings-row" onClick={() => {
                    hapticTap();
                    window.open("https://fpmartinez10.github.io/privacy-policy.html", "_system");
                  }}>
                    <div className="settings-row-icon">🔒</div>
                    <div className="settings-row-body">
                      <div className="settings-row-label">Privacy policy</div>
                    </div>
                    <div className="settings-row-chevron">›</div>
                  </div>
                  <div className="settings-row" onClick={() => {
                    hapticTap();
                    window.open(`mailto:focalstudio.apps@gmail.com?subject=Feature%20Request%20%E2%80%94%20[APP_NAME]&body=Hi%2C%20I%27d%20love%20to%20see%20the%20following%20in%20[APP_NAME]%3A%0A%0A`, "_system");
                  }}>
                    <div className="settings-row-icon">💡</div>
                    <div className="settings-row-body">
                      <div className="settings-row-label">Request a feature</div>
                    </div>
                    <div className="settings-row-chevron">›</div>
                  </div>
                </div>
              </div>

              <div style={{ textAlign: "center", padding: "24px 0 8px", color: "var(--text-muted)", fontSize: 12 }}>
                {APP_NAME} by Focal Studio · v{APP_VERSION}
              </div>

              {/* Unused prefs ref — keeps TypeScript happy until you wire up a NotificationsModal */}
              <span style={{ display: "none" }}>{JSON.stringify(notificationPrefs)}</span>
              <span style={{ display: "none" }}>{typeof handleNotificationPrefsChange}</span>
            </div>
          )}
        </div>
      </main>

      {/* ── Bottom tab bar ── */}
      <nav className="bottom-nav" aria-label="Main navigation">
        <button
          className={`bottom-nav-item${view === "home" ? " active" : ""}`}
          onClick={() => { setView("home"); hapticTap(); }}
        >
          <span className="bottom-nav-icon">🏠</span>
          <span className="bottom-nav-label">Home</span>
        </button>
        <button
          className={`bottom-nav-item${view === "settings" ? " active" : ""}`}
          onClick={() => { setView("settings"); hapticTap(); }}
        >
          <span className="bottom-nav-icon">⚙️</span>
          <span className="bottom-nav-label">Settings</span>
        </button>
      </nav>
    </div>
  );
}
