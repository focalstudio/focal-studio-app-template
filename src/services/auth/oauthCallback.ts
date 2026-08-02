/**
 * The two pure pieces of the Google sign-in flow, kept out of `templates/`.
 *
 * Social modules are copied out of `templates/social/`, which this repo's CI
 * cannot import, type-check, or lint — anything left in there is unverified
 * until it reaches a device. Callback parsing is the likeliest part of an OAuth
 * flow to be subtly wrong (query vs fragment, PKCE vs implicit, an error where a
 * token was expected), and a bug in it looks like "sign-in silently does
 * nothing". So it lives here, beside `appleName.ts`, as plain data-in /
 * data-out with no native or SDK imports, covered by the normal test run.
 *
 * Deliberately no `URL` / `URLSearchParams`: custom schemes like
 * `myapp://auth/callback` parse inconsistently across JS engines, and the
 * Firebase adapter never installs `react-native-url-polyfill` (only the Supabase
 * one does). Hand-rolled string splitting behaves the same everywhere.
 */

import { AuthError } from "./types";
import type { AuthErrorCode } from "./types";

/**
 * What came back on the OAuth redirect.
 *
 * `code` and `tokens` are the two shapes Supabase can produce, and which one you
 * get depends on the client's `flowType`. PKCE (the template's default since
 * Google sign-in landed) yields `?code=`; the older implicit default yields
 * `#access_token=`. The social module handles both so an app wired before that
 * change keeps working without touching its adapter.
 */
export type OAuthCallback =
  | { kind: "code"; code: string }
  | { kind: "tokens"; accessToken: string; refreshToken: string | null }
  | { kind: "error"; code: AuthErrorCode; message: string };

/**
 * Percent-decodes one component, treating `+` as a space per
 * `application/x-www-form-urlencoded`.
 *
 * A malformed escape (`%zz`) makes `decodeURIComponent` throw. Returning the raw
 * value is better than letting a bad character in a provider's error text take
 * down the parse of a callback whose `code` was perfectly fine.
 */
function decodeComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

/** Splits an `a=1&b=2` string. Later duplicates win, matching URLSearchParams. */
function parseParams(input: string): Record<string, string> {
  const params: Record<string, string> = {};

  for (const pair of input.split("&")) {
    if (pair === "") continue;
    const separator = pair.indexOf("=");
    const rawKey = separator === -1 ? pair : pair.slice(0, separator);
    const rawValue = separator === -1 ? "" : pair.slice(separator + 1);
    if (rawKey === "") continue;
    params[decodeComponent(rawKey)] = decodeComponent(rawValue);
  }

  return params;
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

/**
 * Reads an OAuth redirect URL into one of three outcomes.
 *
 * Both halves of the URL are searched. Providers are not consistent about which
 * one they use — the authorization code arrives in the query string, implicit
 * tokens arrive in the fragment, and an error can arrive in either — so guessing
 * from the flow you *think* you configured is how these bugs happen. The
 * fragment wins on a conflict, because that is the half a provider only ever
 * populates deliberately.
 *
 * Never throws. Every failure is a returned `error` variant, so a caller can
 * `switch` exhaustively instead of wrapping this in a try/catch.
 */
export function parseOAuthCallback(url: string): OAuthCallback {
  const hashAt = url.indexOf("#");
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const fragment = hashAt === -1 ? "" : url.slice(hashAt + 1);

  const queryAt = beforeHash.indexOf("?");
  const query = queryAt === -1 ? "" : beforeHash.slice(queryAt + 1);

  // A fragment is usually bare params (`#access_token=…`), but some providers
  // send a routed form (`#/?access_token=…`). Taking everything after a `?`
  // when one is present covers both.
  const fragmentQueryAt = fragment.indexOf("?");
  const fragmentParams = fragmentQueryAt === -1 ? fragment : fragment.slice(fragmentQueryAt + 1);

  const fromFragment = parseParams(fragmentParams);
  const fromQuery = parseParams(query);
  const read = (key: string): string | undefined =>
    nonEmpty(fromFragment[key]) ?? nonEmpty(fromQuery[key]);

  // Errors first. A callback can carry `error` *and* a stale `code`, and
  // redeeming that code would fail one step later with a worse message.
  const error = read("error");
  const errorDescription = read("error_description");
  if (error !== undefined || errorDescription !== undefined) {
    return {
      kind: "error",
      // Backing out of Google's consent screen is a deliberate user action, not
      // a failure. The store swallows `cancelled`, so nothing is shown for a tap
      // the user took back — same contract as dismissing Apple's sheet.
      code: error === "access_denied" ? "cancelled" : "unknown",
      message: errorDescription ?? error ?? "The provider returned an unspecified error.",
    };
  }

  const code = read("code");
  if (code !== undefined) return { kind: "code", code };

  const accessToken = read("access_token");
  if (accessToken !== undefined) {
    return {
      kind: "tokens",
      accessToken,
      // Null is a real outcome, not a parse failure — the caller decides whether
      // it can build a durable session without one. Supabase's `setSession`
      // cannot.
      refreshToken: read("refresh_token") ?? null,
    };
  }

  return {
    kind: "error",
    code: "unknown",
    // No URL echo: on the implicit path this string would contain an access
    // token, and error text ends up in logs.
    message:
      "The sign-in callback carried no code, no tokens, and no error. " +
      "The redirect URI most likely does not match the one registered with the provider.",
  };
}

const GOOGLE_CLIENT_ID_SUFFIX = ".apps.googleusercontent.com";

/**
 * Turns a Google iOS client ID into the reversed form used as its URL scheme:
 * `123-abc.apps.googleusercontent.com` -> `com.googleusercontent.apps.123-abc`
 *
 * Google's iOS OAuth clients accept exactly one redirect URI shape,
 * `<reversed>:/oauthredirect`, and the same reversed string has to be registered
 * as a `CFBundleURLSchemes` entry in `app.json`. Deriving it from the client ID
 * rather than taking a second environment variable means those two cannot drift
 * apart — and drift here fails as a browser that opens and never returns, with
 * nothing pointing at the cause.
 *
 * Throws `AuthError("not_wired")` on anything that isn't a client ID, because
 * the alternative is returning a scheme that silently never resolves.
 */
export function googleReversedClientId(clientId: string): string {
  const trimmed = clientId.trim();
  const id = trimmed.endsWith(GOOGLE_CLIENT_ID_SUFFIX)
    ? trimmed.slice(0, -GOOGLE_CLIENT_ID_SUFFIX.length)
    : "";

  if (id === "") {
    throw new AuthError(
      "not_wired",
      `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID must look like "<id>${GOOGLE_CLIENT_ID_SUFFIX}". ` +
        `Copy the iOS client ID from the Firebase console (Project settings -> Your apps -> iOS).`
    );
  }

  return `com.googleusercontent.apps.${id}`;
}
