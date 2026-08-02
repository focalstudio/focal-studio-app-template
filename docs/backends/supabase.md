# Supabase backend

Postgres, auth, storage, and realtime behind one client. This is the recommended default for apps built from this template.

```bash
bash scripts/add-backend.sh supabase
```

That installs the packages, drops the adapter into `src/services/auth/supabase.ts`, activates it, and makes the Supabase environment variables required. The rest of this page is what the script can't do for you, plus the things that break in React Native.

---

## 1. Create the project

[supabase.com/dashboard](https://supabase.com/dashboard) → New project. Pick a region near your users; it can't be changed later.

## 2. Environment variables

Project Settings → API. Put these in `.env.local`:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The publishable key is what older docs and most blog posts call the **anon key** — same thing, renamed. It is safe to ship in a client binary: **Row Level Security, not key secrecy, is what protects your data.** Anyone can extract it from your app, which is fine and expected.

Never put the `service_role` key in the app. It bypasses RLS entirely.

`env.js` now requires both, so a missing one fails the build rather than surfacing as `undefined` at runtime.

## 3. Apply the schema

SQL Editor → paste and run [`templates/backends/supabase/schema.sql`](../../templates/backends/supabase/schema.sql). It creates:

- a `profiles` table with `on delete cascade` to `auth.users`
- RLS policies for select / insert / update
- a trigger that seeds a profile row on signup
- `delete_own_account()` — **account deletion does not work without this**

Then verify RLS is actually on. A table with policies but RLS disabled is wide open and the dashboard doesn't warn you:

```sql
select relname, relrowsecurity from pg_class where relname = 'profiles';
-- relrowsecurity must be true
```

## 4. Email confirmation

Auth → Providers → Email. With "Confirm email" on (the default), `signUp()` returns a user but **no session**. The adapter returns `null` for that case and the signup screen tells the user to check their inbox — that path is already handled, but test it, because it's the difference between "signup worked" and "signup looks broken".

## 5. Sign in with Apple (optional)

**App Store guideline 4.8** makes Sign in with Apple mandatory the moment your app offers any other third-party login. Adding Google later without this is a rejection.

```bash
bash scripts/add-social-auth.sh
```

The script takes no arguments — it detects Supabase from the adapter already in `src/services/auth/`. It installs `expo-apple-authentication`, copies the social module to `src/services/auth/social.ts`, and composes it onto the provider in `src/services/auth/index.ts`:

```ts
export const authProvider: AuthProvider = { ...supabaseAuthProvider, ...socialAuth };
```

It does **not** touch the adapter or `app.json`. The rest is manual:

> [!warning]
> This adds a native module with a config plugin. **The app no longer runs in Expo Go** — build a dev client (`npx expo run:ios`). It also invalidates the EAS build cache, so your next build is a cold one.

**1. `app.json`** — add the plugin and the entitlement:

```json
"plugins": ["expo-router", "expo-system-ui", "expo-apple-authentication"],
"ios": { "usesAppleSignIn": true }
```

Without `usesAppleSignIn` the build fails **App Store validation at upload time**, not at runtime — so you find out at the worst possible moment.

**2. Apple Developer** → Certificates, Identifiers & Profiles → Identifiers → your App ID → enable **Sign In with Apple**.

That is all the native iOS flow needs. A Services ID, a Key, and a Return URL are only for the web/Android flow, which this recipe doesn't ship. The entitlement change invalidates your provisioning profile — let EAS regenerate it, or re-sync in Xcode.

**3. Supabase** → Authentication → Providers → Apple → enable, then put your **iOS bundle identifier** in the *Client IDs* field.

This is the step everyone misses. Without it `signInWithIdToken` fails with `Unacceptable audience in id_token` and nothing points at the cause.

### What the module does for you

Apple hands back the user's name **only on the very first authorization**, ever, for that Apple ID and app pair — every later sign-in returns nulls, and reinstalling doesn't reset it. The module writes it to `user_metadata` immediately via `updateUser`, because there is no second chance.

One consequence to know about: `handle_new_user()` in `schema.sql` populates `profiles.name` from the metadata present **at signup**, which for an Apple user is empty at that instant. If you display `profiles.name` rather than the session's user metadata, upsert it after an Apple sign-in.

---

## What the adapter does that quickstarts skip

Each of these fails the same silent way — the user is signed out on every cold start, and you won't notice in a simulator session.

| Line in the adapter | Why it's there |
|---|---|
| `import "react-native-url-polyfill/auto"` | RN has no native `URL`. Without it: `URL.hostname is not implemented, js engine: hermes`. Expo's own guide omits this; keep it. |
| `import "expo-sqlite/localStorage/install"` + `storage: localStorage` | The session store. Without an explicit adapter, supabase-js defaults to browser `localStorage`, which doesn't exist in RN. |
| `detectSessionInUrl: false` | Mandatory on native. There is no URL to parse a session from. |
| `AppState` listener at **module scope** | Drives `startAutoRefresh` / `stopAutoRefresh`. Without it, tokens expire while backgrounded and the first foreground request 401s. Inside a component it would stack a listener per mount. |
| `signOut({ scope: "local" })` after delete | A plain `signOut()` throws `User from sub claim in JWT does not exist` once the user is gone — which would look like a failed deletion. |

### Why not `expo-secure-store`

Supabase's own social-auth example uses a SecureStore adapter, and several blog posts recommend it. **SecureStore caps values at 2048 bytes and a Supabase session already exceeds that.** Today the official adapter only `console.warn`s; Expo has signalled it may throw in a future SDK. `expo-sqlite/localStorage` is the current recommendation and has no such limit.

If you have a hard requirement that the refresh token be encrypted at rest, the `LargeSecureStore` pattern (AES key in SecureStore, ciphertext in AsyncStorage) is the escape hatch — tracked as a separate issue.

---

## Row Level Security

Two rules the schema follows that are easy to get wrong, both from [Supabase's RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security):

**Wrap the function call.** `(select auth.uid()) = user_id`, not `auth.uid() = user_id`. The subquery form lets Postgres cache the result as an initPlan and evaluate it once per query instead of once per row — Supabase measures **94–99%** improvements. The naive form works fine on 100 rows and falls over at 100k, which is the worst possible way to find out.

**Always add `to authenticated`.** Otherwise the policy is also evaluated for anonymous requests that can never satisfy it.

And index every column a policy references, or each check is a sequential scan.

For `update` you need **both** `using` (which existing rows are visible) and `with check` (what the row may become). Omitting `with check` lets a user reassign their row to someone else.

---

## Account deletion

Required by Google Play Data safety and Apple App Privacy for any app supporting account creation.

The client SDK **cannot** call `auth.admin.deleteUser` — that needs the service_role key. `delete_own_account()` is a `SECURITY DEFINER` function that deletes only the caller's own row, with `on delete cascade` removing their app data.

Before submitting to either store, verify the full path on a real build:

1. Settings → Danger Zone → Delete Account
2. Confirm the row is gone from `auth.users` in the dashboard — **not merely signed out**
3. Then deliberately break the RPC (rename it) and try again. The UI must show "Couldn't Delete Account" and leave the user signed in.

Step 3 is the one people skip. `deleteAccount()` throwing on failure is the contract that stops a failed deletion from looking successful.

---

## Gotchas

- **Offline `getSession()` returns `null`** even with a valid persisted session. The client then falls back to the publishable key, `auth.uid()` becomes NULL, RLS denies, and you get a **406 that looks like an RLS bug** but is a network problem. Tracked as a separate issue.
- **Apple returns the user's name once, ever.** `fullName` and a real `email` arrive only on the *first* authorization for that Apple ID and app pair. Reinstalling the app does not reset it — to test that path again you must revoke the app under Settings → Apple ID → Sign in with Apple. Capture the name on first sign-in or it is gone for good.
- **Apple's private relay.** Users can hide behind `@privaterelay.appleid.com`. If you send them mail, configure the relay domain and sender in Apple's console, or it silently bounces.
- **`makeRedirectUri()` resolves differently** in Expo Go (`exp://`), a dev client, and a standalone build. Always test OAuth on a real build. Applies to Google sign-in, which is tracked as a separate issue.
- **PKCE on React Native**: Supabase's deep-linking guide shows the *implicit* flow (reading `access_token` from the URL). If you set `flowType: 'pkce'`, the callback carries `?code=` and you must call `exchangeCodeForSession(code)` — single-use, 5-minute TTL, same device. The docs don't cover this; see the Google sign-in issue. (Sign in with Apple is unaffected — it uses a native sheet and an identity token, with no browser round-trip.)
- **Typed database**: run `supabase gen types typescript --linked > src/types/database.types.ts` and use `createClient<Database>(...)`. Tracked as a separate issue.

---

## Fetching data

The template wires a `QueryClientProvider` in `app/_layout.tsx`. Keep Supabase calls in
hooks under `src/hooks/`, not in screens:

```ts
// src/hooks/useProfile.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/services/auth/supabase";
import { useAuthStore } from "@/store/useAuthStore";

export function useProfile() {
  const userId = useAuthStore((s) => s.user?.id);

  return useQuery({
    // Scope the key by user id. Two accounts on one device must never share
    // a cache entry, even before the sign-out clear runs.
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}
```

The cache is cleared on sign-out and account deletion (`clearQueryCache()` in
`useAuthStore`), so the previous user's rows can't be served to the next one.

**Watch for the offline false positive.** If `getSession()` fails while offline, the client
falls back to the publishable key, `auth.uid()` becomes NULL, RLS denies the row, and you
get a **406 that looks like a broken policy** but is a network problem. Don't "fix" your
RLS in response to it.

## Adding tables

Follow the pattern in `schema.sql`: reference `auth.users(id) on delete cascade`, enable RLS, write policies with `(select auth.uid())` and `to authenticated`, and index the policy column. The cascade is what keeps account deletion working as your schema grows — without it you'll be deleting rows by hand in the RPC.
