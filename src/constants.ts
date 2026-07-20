import packageJson from "../package.json";

// App identity — filled by the SETUP.md placeholder replacement step.
export const APP_NAME = "[APP_NAME]";
export const APP_SLUG = "[APP_SLUG]";
export const APP_ID = "[APP_ID]";
export const APP_COLOR = "[APP_COLOR]";
export const APP_COLOR_DARK = "[APP_COLOR_DARK]";

// Storage key prefix — namespaces all AsyncStorage keys.
export const STORAGE_PREFIX = "[APP_SLUG]_";

// Derived from package.json — the single source of truth for the version.
// Do NOT hardcode the version here: it used to be a literal that
// scripts/bump-version.sh rewrote with sed, which silently no-opped on macOS and
// shipped a stale version. Deriving it makes that class of desync impossible.
export const APP_VERSION = packageJson.version;

// Version-scoped key — changes on every version bump, resetting dev mode automatically.
export const DEV_MODE_KEY = `${STORAGE_PREFIX}dev_mode_${APP_VERSION}`;

// Replace with your app's privacy policy URL after running init.sh.
export const PRIVACY_POLICY_URL = "[PRIVACY_POLICY_URL]";

// Replace with your support email address after running init.sh.
export const SUPPORT_EMAIL = "[SUPPORT_EMAIL]";
