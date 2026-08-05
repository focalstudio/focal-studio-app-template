# RevenueCat

In-app purchases and subscriptions behind the `PaywallProvider` port.

```bash
bash scripts/add-paywall.sh revenuecat
```

**This adds native code.** The app no longer runs in Expo Go with working
purchases — you need a dev client. See [Testing](#testing) below.

---

## What the script does

1. `npx expo install react-native-purchases -- --legacy-peer-deps`
2. Copies `templates/paywall/revenuecat.ts` → `src/services/paywall/revenuecat.ts`
3. Copies its contract tests → `src/services/paywall/__tests__/revenuecat.test.ts`
4. Rewrites the single assignment in `src/services/paywall/index.ts`
5. Sets `PAYWALL = "revenuecat"` in `env.js`, which promotes the RevenueCat keys
   from optional to required
6. Uncomments the `EXPO_PUBLIC_REVENUECAT_*` block in `.env.example`

It deliberately does **not** touch `app.json`. `react-native-purchases` ships no
config plugin and is a classic autolinked module — adding a `plugins` entry for
it breaks the build.

It also deliberately does not touch `src/services/paywall/revenuecat.ts` on a
re-run without `--force`: the block at the top of that file is yours to edit, and
a script that regex-patches a file you have customised is a script that
eventually mangles one.

---

## The two settings you must edit

At the top of `src/services/paywall/revenuecat.ts`:

```ts
/** The entitlement identifier from your RevenueCat dashboard. Case-sensitive. */
const ENTITLEMENT_ID = "pro";

/** Only needed if your product ids don't already end in a tier token. */
const PRODUCT_TIERS: Readonly<Record<string, SubscriptionTier>> = {};
```

Name your products so they end in a recognised token and `PRODUCT_TIERS` can stay
empty:

```
<bundleId>.pro.monthly
<bundleId>.pro.annual      (.yearly also works)
<bundleId>.pro.lifetime
```

Bundle-id prefixes because App Store Connect product ids are immutable and unique
across your whole developer account; lowercase because Play restricts ids to
lowercase alphanumerics, `.` and `_`. The pattern satisfies both, and Play's
`base-plan:id` suffix is parsed too.

---

## Dashboard setup

1. Create a project at <https://app.revenuecat.com>.
2. Add your iOS app and copy the **public SDK key** (not the secret API key) into
   `.env.local` as `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`. Add
   `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` if you ship on Play.
   `env.js` rejects a key carrying the wrong prefix (`appl_` / `goog_`), so a
   swapped pair fails the build instead of surfacing at runtime as an opaque
   "invalid credentials".
3. Create a `pro` entitlement and attach your products to it.
4. Create an offering, mark it **current**, and fill the standard package slots
   (`$rc_monthly`, `$rc_annual`, `$rc_lifetime`).

### Two traps that look like bugs in this code

**All subscriptions in ONE App Store Connect subscription group.** Monthly and
annual in separate groups lets a user hold both at once, makes an "upgrade"
double-charge them, and makes the reported tier flip between the two. This is not
recoverable after people have subscribed.

**Create an In-App Purchase Key (.p8) and set the App Store Server Notifications
URL**, both in RevenueCat's iOS app settings. Without them RevenueCat never
learns about renewals, expiries or refunds: the entitlement listener goes
permanently silent, an expired user keeps Pro forever, and every symptom points
at the adapter rather than at the missing webhook.

---

## Testing

Purchases do not work in Expo Go. `react-native-purchases` falls back to
RevenueCat's Preview API Mode there, which returns stub offerings and cannot
complete a purchase — the app boots, but nothing can be bought.

```bash
npx expo prebuild
npx expo run:ios
```

Then use a sandbox tester account, or a StoreKit configuration file in Xcode for
local-only testing.

Adding this package invalidates the EAS build cache, so the next iOS build is a
full rebuild (~15 min).

---

## How it fits the port

`src/services/paywall/` holds the contract; this adapter is a thin translation
layer over it. Everything with real logic in it lives in `src/` rather than in
`templates/`, because `templates/` is excluded from tsconfig, eslint **and**
jest — anything left there is unverified until it reaches a device.

| Module | Responsibility |
|---|---|
| `types.ts` | The `PaywallProvider` port, `PaywallError`, the subscription schema |
| `entitlement.ts` | Entitlement → one of the four tiers |
| `offerings.ts` | Package selection, localized price and intro-offer copy |
| `errors.ts` | RevenueCat error codes → `PaywallErrorCode` |
| `cache.ts` | The local entitlement mirror that makes "never downgrade" hold |
| `revenuecat.ts` | SDK calls only — no branch that isn't a null check |

**The rule while editing the adapter:** if you are writing an `if` that is not a
null-check on an SDK return value, it belongs in `src/`.

### Contract points worth knowing

- **`getSubscription()` never throws and never downgrades.** If the store cannot
  be reached, it falls back to the last entitlement this device saw. The failure
  mode being guarded against is revoking access someone paid for. This is the
  *inverse* of `AuthProvider.getSession()`, which throws so the store can block
  on a retry screen — there, trusting an unverified session is a security hole.
- **`restore()` finding nothing is a success**, not an error. But it throws when
  offline: silently reporting free would tell a paying user they own nothing.
- **`payment_pending` is neither success nor failure.** Ask-to-Buy and SCA
  purchases complete minutes or days later and arrive through `subscribe()`.
  Nothing is granted, and the UI says so without apologising.
- **Identity is wired.** `usePaywallStore.init()` calls `identify()` / `forget()`
  as the signed-in user changes. Without it, on a shared device the next person
  to sign in inherits the previous user's Pro.

---

## RevenueCat Paywalls (`react-native-purchases-ui`)

Not installed, and not wired. RevenueCat can render a remotely-configured paywall
UI, which lets you change pricing and layout with no app update.

The trade-off for this template: it bypasses `src/theme/` entirely, cannot be
render-tested, and its peer dependency pins `react-native-purchases` to an exact
version. `app/paywall.tsx` already renders store-localized prices through the
port, so the main benefit — never hardcoding a price — is already covered.

If you want it, install it yourself and pin both packages to the same version.
