# Release workflow

> Extracted from `.claude/CLAUDE.md` to keep the always-loaded instructions small.
> Read this file when cutting a release. The [`parallel-release`](../skills/parallel-release/SKILL.md)
> skill is the dual-platform procedure around it, and `release-manager` runs both.

---

When the user says to cut a release:

1. Create `release/x.x.x` off `dev`.
2. Run `bash scripts/bump-version.sh x.x.x` — updates `package.json` and `app.json` version in one step. **`src/constants.ts` needs no edit**: `APP_VERSION` and `DEV_MODE_KEY` are derived from `package.json`, so they track the bump automatically. The script deliberately does not touch it.
3. Move `## [Unreleased]` in `CHANGELOG.md` to `## [x.x.x] — YYYY-MM-DD`; add a fresh empty `## [Unreleased]` section above it.
4. **Pre-emptive code review**: before opening the PR, review every file changed since `dev`. For each changed TypeScript and React file, check for: broken async contracts, state not reset on all exit paths, missing guards in async callbacks, resource cleanup gaps (notifications, timers), timing races, and type contract mismatches. Fix all real bugs found before opening the PR. This prevents cascading review rounds from CI.
5. **Sync with main before opening the PR**: run `git fetch origin main && git merge origin/main` on the release branch. Conflicts, if any, will only be version strings; keep ours. This prevents GitHub rejecting the PR with a merge conflict.
6. Open a PR: `release/x.x.x` → `main`.
7. The `release.yml` GitHub Actions workflow automatically creates tag `vx.x.x` and publishes a GitHub Release on merge — no manual tagging needed.
8. **Immediately after step 6** (do not wait for main merge), open a second PR: `release/x.x.x` → `dev` (to keep dev in sync).
   > **Critical**: when merging the `release/x.x.x` → `main` PR via `gh pr merge`, **never use `--delete-branch`**. Deleting the head branch auto-closes the backmerge PR. Use `gh pr merge NNN --merge` only. Delete the release branch manually after both PRs are merged.
9. Follow the **Apple App Store checklist** in [.claude/reference/store-submission.md](store-submission.md) for the iOS upload.
10. Follow the **Google Play checklist** in the same file for the Android upload — `release.yml` calls `android-release.yml` automatically as part of the same run right after creating the `vx.x.x` tag in step 7, but Play Console review steps are still manual.
11. Verify dev mode is off on device before store submission.

## Automated release workflow
`.github/workflows/release.yml` triggers on every push to `main`. It:
1. Reads the version from `package.json`.
2. Checks whether tag `vVERSION` already exists (skips all steps if it does — safe to re-run).
3. Extracts the matching `## [VERSION]` section from `CHANGELOG.md` as release notes.
4. Creates and pushes an annotated git tag `vVERSION`.
5. Creates a GitHub Release with the extracted release notes.
6. If (and only if) a new tag was actually created in this run, calls `.github/workflows/android-release.yml` as a reusable workflow (`uses:` + `secrets: inherit`) in a dependent job — no PAT or extra secret needed, since a `push: tags:` trigger would never fire for a tag pushed with the default `GITHUB_TOKEN`.

`.github/workflows/android-release.yml` itself has no tag trigger — it's `workflow_call` (invoked by `release.yml` above) plus `workflow_dispatch` for manual reruns (e.g. re-submitting after fixing something in Play Console). It runs `eas build --platform android --profile production` then `eas submit --platform android --profile production --latest` against the `internal` Play track. Requires the one-time keystore + service-account setup in [KEYSTORE.md](../../KEYSTORE.md) — it will no-op with a clear message if the app hasn't been bootstrapped yet, but will fail if bootstrapped and the setup hasn't been done.

> **For the full simultaneous iOS + Android release procedure — recurring flow, the one-time Android bootstrap, what's automated vs manual, and verification — use the [`parallel-release`](../skills/parallel-release/SKILL.md) skill (`/parallel-release`).** The checklists below are the per-store manual tails of that procedure.
