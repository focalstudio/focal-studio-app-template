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

## 5. Social sign-in — Apple and Google (optional)

One script adds both, and that is deliberate: **App Store guideline 4.8** makes Sign in with Apple mandatory the moment your app offers any other third-party login, so shipping Google alone is a rejection.

```bash
bash scripts/add-social-auth.sh
```

The script takes no arguments — it detects Supabase from the adapter already in `src/services/auth/`. It installs `expo-apple-authentication` and `expo-web-browser`, copies the social module to `src/services/auth/social.ts`, and composes it onto the provider in `src/services/auth/index.ts`:

```ts
export const authProvider: AuthProvider = { ...supabaseAuthProvider, ...socialAuth };
```

It does **not** touch the adapter or `app.json`. The rest is manual:

> [!warning]
> This adds a native module with a config plugin. **The app no longer runs in Expo Go** — build a dev client (`npx expo run:ios`). It also invalidates the EAS build cache, so your next build is a cold one.

### Apple

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

#### What the Apple module does for you

Apple hands back the user's name **only on the very first authorization**, ever, for that Apple ID and app pair — every later sign-in returns nulls, and reinstalling doesn't reset it. The module writes it to `user_metadata` immediately via `updateUser`, because there is no second chance.

One consequence to know about: `handle_new_user()` in `schema.sql` populates `profiles.name` from the metadata present **at signup**, which for an Apple user is empty at that instant. If you display `profiles.name` rather than the session's user metadata, upsert it after an Apple sign-in.

### Google

Nothing enters the app on this backend. Supabase holds Google's client ID **and** its secret and performs the token exchange server-side, so there is no `.env.local` entry and no `app.json` change — which also means the recipe works on iOS and Android alike, unlike Apple's native sheet.

**4. Google Cloud console** → *APIs & Services*. Configure the **OAuth consent screen** first (external, with your app name and support email), then *Credentials* → *Create credentials* → *OAuth client ID* → **Web application**.

Web application, **not iOS** — this is the counter-intuitive part. Supabase does the exchange from its own servers, so it needs a client type that has a secret. An iOS client has none and won't work here.

Authorised redirect URI, exactly:

```
https://<ref>.supabase.co/auth/v1/callback
```

**5. Supabase** → Authentication → Providers → **Google** → enable, then paste the client ID and client secret.

**6. Supabase** → Authentication → **URL Configuration** → *Redirect URLs*. Add every form your team actually runs:

```
<scheme>://auth/callback                  # dev client and standalone builds
exp://127.0.0.1:8081/--/auth/callback     # Expo Go, if you still use it
```

`<scheme>` is the `scheme` field in `app.json`. A value that isn't on this list produces a browser that opens and never comes back — see the redirect-URI gotcha below, which is the single most common way this recipe fails.

#### How the Google flow works

`signInWithOAuth({ provider: "google", skipBrowserRedirect: true })` returns a URL rather than navigating; `WebBrowser.openAuthSessionAsync` opens it and resolves when the redirect fires; `parseOAuthCallback` reads the result; `exchangeCodeForSession` turns the code into a session.

That parsing step lives in [`src/services/auth/oauthCallback.ts`](../../src/services/auth/oauthCallback.ts), not in `social.ts`, and it is unit-tested. Social modules are copied out of `templates/`, which CI cannot type-check or lint — so the part most likely to be subtly wrong (query vs fragment, PKCE vs implicit, an error where a token was expected) lives where the test run can see it. It reads **both** callback shapes, so an app whose adapter predates `flowType: "pkce"` keeps working without editing the adapter.

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

## Typed database

`src/types/database.types.ts` is generated from `schema.sql` and committed. The adapter passes
it to `createClient<Database>(...)`, which is what makes `.from("profiles").select()` return
typed rows instead of `any` — a renamed column becomes a build error instead of `undefined` at
runtime.

Regenerate it whenever you change `schema.sql`:

```bash
supabase start                 # needs Docker
psql "$(supabase status -o env | grep '^DB_URL=' | cut -d'"' -f2)" \
  -f templates/backends/supabase/schema.sql
supabase gen types typescript --local > src/types/database.types.ts
```

`verify-backend.yml` regenerates the same file in CI and fails the PR when the committed copy
has drifted. If you don't have Docker, push the change and copy the `database-types` artifact
from the failed run.

**Generated `--local`, not `--linked`, on purpose.** Reading from the local instance needs no
project ref and no `SUPABASE_ACCESS_TOKEN` — the access token is the one credential worth not
putting in CI — and it means the check also covers this template, which has no linked project.
The trade-off is the one named in Gotchas: **apply schema changes by editing `schema.sql` and
re-running it**, not by editing tables in the dashboard. A dashboard-only change is caught when
someone writes it back to the file, not before.

---

## Backend verification in CI

`.github/workflows/verify-backend.yml` applies `schema.sql` to a throwaway local Supabase and
asserts the account-deletion contract end to end — the auth user is really gone (checked with
the `service_role` key, not by trusting the RPC's return value), the `on delete cascade` really
removed the profile, and `anon` cannot reach the function.

The assertion that earns the workflow: it **drops `delete_own_account()` and re-runs the call**,
requiring the client to see an error. A deletion that silently no-ops is indistinguishable from
a successful one, which is exactly what Google Play's Data safety requirement exists to catch.

It runs on PRs touching `templates/backends/**` and weekly, to catch drift in Supabase itself.
It no-ops when `BACKEND` in `env.js` isn't `"supabase"`.

**Two things it deliberately does not test**: cold-start session persistence and background
token refresh. Those exercise the `expo-sqlite/localStorage` adapter and the module-scope
`AppState` listener, neither of which exists in headless Node — a green check there would prove
the Supabase API works, not that our wiring does, and would stop people running the real test.
They are manual pre-submission items in
[`.claude/reference/store-submission.md`](../../.claude/reference/store-submission.md).

---

## Gotchas

- **Offline `getSession()` throws, it doesn't silently sign out.** `toAuthError` (see above) classifies offline/DNS failures as `AuthError("network")`, and `useAuthStore.hydrate()` branches on that code: a network failure leaves the existing session/user state untouched and sets `hydrationError: "network"` instead of forcing the user to signed-out. `app/_layout.tsx` routes that state to `app/network-error.tsx`, a blocking "No Connection" retry screen, rather than the login screen — so a flaky connection never looks like a silent sign-out, and the app never runs a request against a session it couldn't verify (which is what used to produce a confusing **406 that looks like an RLS bug** but is actually `auth.uid()` resolving to NULL on an unverified session). This relies on the `getSession()` contract in `src/services/auth/types.ts`: answer from storage first, and throw `network` only when refreshing a session that exists. Supabase satisfies it as shipped — `auth.getSession()` reads local persistence and only hits the network to refresh an expired session, so a signed-out device offline gets `null`, not a throw. Preserve that if you wrap it.
- **Apple returns the user's name once, ever.** `fullName` and a real `email` arrive only on the *first* authorization for that Apple ID and app pair. Reinstalling the app does not reset it — to test that path again you must revoke the app under Settings → Apple ID → Sign in with Apple. Capture the name on first sign-in or it is gone for good.
- **Apple's private relay.** Users can hide behind `@privaterelay.appleid.com`. If you send them mail, configure the relay domain and sender in Apple's console, or it silently bounces.
- **The redirect URI resolves differently per build type.** `Linking.createURL()` (and `makeRedirectUri()`) return `exp://…/--/auth/callback` in Expo Go and `<scheme>://auth/callback` in a dev client or standalone build. Two rules follow, and breaking either produces the same symptom — a browser that opens and never hands control back. **First**, every form your team runs has to be in Supabase's *URL Configuration → Redirect URLs* allowlist. **Second**, the string passed as `redirectTo` and the string passed to `openAuthSessionAsync` must be byte-identical; `social.ts` calls one helper for both so they cannot drift. This is why OAuth "works in Expo Go and breaks in TestFlight" — the values differ, and only one of them was ever allowlisted.
- **PKCE on React Native**: the adapter sets `flowType: 'pkce'`, so the callback carries `?code=` and the session comes from `exchangeCodeForSession(code)` — not from reading `access_token` out of the URL, which is what Supabase's deep-linking guide shows. That code is **single-use**, has a **~5-minute TTL**, and works on **that device only**: the code verifier lives in the client's own storage, so a code cannot be relayed from a browser or a machine elsewhere. Supabase's docs never mention this. (Sign in with Apple is unaffected — it uses a native sheet and an identity token, with no browser round-trip.)
- **`skipBrowserRedirect: true` is mandatory on Expo.** Without it supabase-js tries to navigate `window.location`, which does not exist in React Native, so you get no navigation *and* no `data.url` to hand to `WebBrowser`. `signInWithOAuth` appears to succeed and nothing at all happens.
- **`schema.sql` is the source of truth, not the dashboard.** See [Typed database](#typed-database) — CI generates the types from `schema.sql`, so a change made only in the SQL Editor is invisible to it until you write the change back into the file.

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
