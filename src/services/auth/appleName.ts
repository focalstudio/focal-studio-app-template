/**
 * The one decision in the Apple sign-in flow that is worth getting right.
 *
 * Apple sends `fullName` **only on the first authorization**, ever, for a given
 * Apple ID and app pair. Every later sign-in returns nulls, and reinstalling
 * does not reset it — the user has to revoke the app under Settings -> Apple ID
 * -> Sign in with Apple. So there is exactly one chance to store it, and a bug
 * here is unrecoverable per user rather than merely annoying.
 *
 * That logic lives here, in `src/services/auth/`, rather than inside
 * `social.ts`. Social modules are copied out of `templates/`, which CI cannot
 * import, type-check, or lint, so anything left in there is unverified until it
 * reaches a device. This file is plain data-in / data-out with no native or SDK
 * imports, so it is covered by the normal test run.
 */

/** The shape of `AppleAuthenticationCredential.fullName`, minus the fields we ignore. */
export type AppleFullName = {
  givenName?: string | null;
  familyName?: string | null;
} | null;

/**
 * The name to persist after an Apple sign-in, or `null` when there is nothing
 * to do.
 *
 * Returns `null` when Apple sent nothing usable (every later sign-in), and also
 * when the account already has a name — re-writing it on a subsequent sign-in
 * would overwrite a name the user may have since edited with a stale value from
 * Apple, or with nothing at all.
 */
export function appleNameToPersist(
  fullName: AppleFullName,
  existingName?: string
): string | null {
  // A name already on the account wins. Apple is only a source for the very
  // first sign-in; after that the user's own edits are more current.
  if (existingName !== undefined && existingName.trim() !== "") return null;

  const name = [fullName?.givenName, fullName?.familyName]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(" ");

  return name === "" ? null : name;
}
