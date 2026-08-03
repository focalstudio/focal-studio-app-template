import { STORAGE_PREFIX } from "../../constants";
import { loadJson, saveJson, removeItem } from "../../utils/storage";
import { userSchema } from "../../types/schemas";
import { AuthError, authSessionSchema } from "./types";
import type { AuthProvider, AuthSession } from "./types";

const SESSION_KEY = `${STORAGE_PREFIX}auth_session`;

/**
 * Key used before the session model existed. Read once so a device that was
 * signed in under the old scaffold isn't stranded, then dropped on sign-out.
 */
const LEGACY_USER_KEY = `${STORAGE_PREFIX}auth_user`;

function notWired(action: string): AuthError {
  return new AuthError(
    "not_wired",
    `${action} requires a backend. Run \`bash scripts/add-backend.sh <supabase|firebase>\`, ` +
      `or implement the AuthProvider port in src/services/auth/.`,
  );
}

/**
 * The no-backend scaffold. It persists whatever session it is given and
 * restores it across launches, so the app is navigable during UI development,
 * but every call that would need a server throws `not_wired`.
 *
 * That is deliberate. The previous scaffold let signup mint a fake user and
 * granted full app access, which shipped silently in any app whose author
 * hadn't wired auth yet. Failing loudly is the safer default.
 */
export const localAuthProvider: AuthProvider = {
  name: "local",

  async getSession(): Promise<AuthSession | null> {
    // A malformed blob and a missing one both read back as null, which is what
    // the migration below wants: either way there is no usable session yet.
    const session = await loadJson(SESSION_KEY, null, authSessionSchema);
    if (session !== null) return session;

    // Migrate a bare user blob written by the pre-session scaffold.
    const legacy = await loadJson(LEGACY_USER_KEY, null, userSchema);
    if (legacy !== null) {
      const migrated: AuthSession = {
        accessToken: "local-scaffold",
        refreshToken: null,
        expiresAt: null,
        user: legacy,
      };
      await saveJson(SESSION_KEY, migrated);
      await removeItem(LEGACY_USER_KEY);
      return migrated;
    }

    return null;
  },

  async signIn(): Promise<AuthSession> {
    throw notWired("Signing in");
  },

  async signUp(): Promise<AuthSession | null> {
    throw notWired("Creating an account");
  },

  async resetPassword(): Promise<void> {
    throw notWired("Resetting a password");
  },

  async signOut(): Promise<void> {
    await removeItem(SESSION_KEY);
    await removeItem(LEGACY_USER_KEY);
  },

  /**
   * The scaffold has no remote account, so there is nothing to delete and
   * nothing that can fail. A real provider must call its delete API here and
   * throw on failure — see the contract in `types.ts` and the Data safety
   * checklist in `.claude/CLAUDE.md`.
   */
  async deleteAccount(): Promise<void> {
    await removeItem(SESSION_KEY);
    await removeItem(LEGACY_USER_KEY);
  },

  /** No external event source, so nothing to observe and nothing to tear down. */
  subscribe(): () => void {
    return () => {};
  },

  // signInWithApple / signInWithGoogle are intentionally absent: the local
  // scaffold cannot perform them, and omitting them lets the UI say so.
};

/**
 * Test seam. Lets a test or a dev-only screen put the app into a signed-in
 * state without a backend. Not exported from the barrel — import it directly.
 */
export async function seedLocalSession(session: AuthSession): Promise<void> {
  await saveJson(SESSION_KEY, session);
}
