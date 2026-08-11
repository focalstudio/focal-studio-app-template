# Cross-repo GitHub token

> Extracted from `.claude/CLAUDE.md` to keep the always-loaded instructions small.
> Read this file when a workflow needs to read or write a **different** repository, or when
> rotating the credential below.

The default `GITHUB_TOKEN` is scoped to the repository the workflow runs in. It cannot clone a
private sibling repo, push a branch to another repo, or open an issue or PR there. Anything
cross-repo needs a stored credential.

## The decision: one org-owned GitHub App

**`Focal Studio Cross-Repo Bot`** — a GitHub App owned by the `focalstudio` org, installed on
all repositories.

Two consumers share it, which is why it exists at all rather than a per-workflow secret:

| Consumer | Target repos | Uses |
|---|---|---|
| `.github/workflows/publish-privacy.yml` (#56) | `focalstudio.github.io` | `contents:write`, `pull_requests:write` |
| scheduled drift report (#145, not yet built) | `tick`, `mealcart`, `WildFocus`, `vestia-portfolio-manager` | `contents:read`, `issues:write` |

**Why not a fine-grained PAT.** A PAT applies **one permission union across every repo it
selects**, so a single PAT serving both consumers would hand the four app repos
`pull_requests:write` they never need. Two PATs means two secrets and two rotation stories for
one decision — the thing this was meant to avoid. The App additionally: is owned by the org
rather than a person (it survives an account change), has no annual expiry to renew, appears in
the audit log as a named bot rather than as a human, and gets its own rate limit.

**The App's permission set is still a union** — `contents`, `pull requests` and `issues`, all
write. What bounds a given run is `create-github-app-token`'s `repositories:` input, which mints
a token valid for only the repos that workflow touches. Always set it; the default is every repo
the App is installed on.

## Secrets

Two **org-level** secrets, visibility **all repositories**:

| Secret | Contents |
|---|---|
| `FOCALSTUDIO_BOT_APP_ID` | The App's numeric App ID (not the client ID). |
| `FOCALSTUDIO_BOT_PRIVATE_KEY` | The full `.pem` private key, including the BEGIN/END lines. |

Visibility `all` is deliberate. This org's template repo is public, but every consuming workflow
is `workflow_dispatch` or `schedule` — fork PRs never receive secrets, so using one already
requires write access. A `selected repositories` list would be one more thing to update each
time an app is generated from the template, and forgetting it fails confusingly rather than
loudly.

## Using it in a workflow

```yaml
permissions:
  contents: read          # the default token; the cross-repo work does not use it

steps:
  # Secrets cannot be tested in a step-level `if:`, so route them through env first and let
  # the workflow skip cleanly in a repo or org where the App was never provisioned.
  - name: Check for cross-repo credentials
    id: creds
    env:
      APP_ID: ${{ secrets.FOCALSTUDIO_BOT_APP_ID }}
      APP_PRIVATE_KEY: ${{ secrets.FOCALSTUDIO_BOT_PRIVATE_KEY }}
    run: |
      if [ -n "$APP_ID" ] && [ -n "$APP_PRIVATE_KEY" ]; then
        echo "has_creds=true" >> "$GITHUB_OUTPUT"
      else
        echo "has_creds=false" >> "$GITHUB_OUTPUT"
      fi

  - name: Mint a scoped installation token
    id: app-token
    if: steps.creds.outputs.has_creds == 'true'
    uses: actions/create-github-app-token@v2
    with:
      app-id: ${{ secrets.FOCALSTUDIO_BOT_APP_ID }}
      private-key: ${{ secrets.FOCALSTUDIO_BOT_PRIVATE_KEY }}
      owner: focalstudio
      repositories: focalstudio.github.io    # narrow to what this workflow touches
```

The minted token is valid for one hour and is masked in logs. Use it as:

- `GH_TOKEN: ${{ steps.app-token.outputs.token }}` for `gh` commands (add `--repo owner/name`).
- `https://x-access-token:${TOKEN}@github.com/owner/name.git` for `git clone` / `git push`.

`steps.app-token.outputs.app-slug` gives the bot's login, for a commit identity of
`<app-slug>[bot]` / `<app-id>+<app-slug>[bot]@users.noreply.github.com`.

## Rules for cross-repo writes

**Open a PR. Never commit to another repo's default branch, and never auto-merge.** Both
consumers landed on this independently and for the same reason: the receiving repo's copy may
be deliberately better than the generated one — MealCart's live privacy page is hand-written and
richer, and tick's `.maestro` flows differ from the template's by 58 lines of correct
app-specific prose. Nothing mechanical distinguishes "stale" from "deliberately diverged". A
human reading a diff does. See the cross-repo propagation section of `.claude/CLAUDE.md`.

## Provisioning and rotation

Creating the App is a browser flow — there is no API for it.

1. `https://github.com/organizations/focalstudio/settings/apps/new`
2. Name `Focal Studio Cross-Repo Bot`; homepage the template repo; untick **Webhook → Active**.
3. Repository permissions: Contents *Read and write*, Pull requests *Read and write*,
   Issues *Read and write*. (Metadata read-only is added automatically.)
4. **Where can this App be installed:** *Only on this account*.
5. Create → note the **App ID** → **Generate a private key** (downloads a `.pem`).
6. **Install App** → `focalstudio` → **All repositories**.

Then set the secrets (needs the `admin:org` scope, which `gh` does not request by default):

```bash
gh auth refresh -h github.com -s admin:org
gh secret set FOCALSTUDIO_BOT_APP_ID      --org focalstudio --visibility all --body "<APP_ID>"
gh secret set FOCALSTUDIO_BOT_PRIVATE_KEY --org focalstudio --visibility all < ~/Downloads/<key>.pem
rm ~/Downloads/<key>.pem
```

**To rotate:** generate a second private key in the App's settings, update
`FOCALSTUDIO_BOT_PRIVATE_KEY`, confirm a workflow run succeeds, then delete the old key. The App
ID never changes. Keys do not expire, so rotation is a deliberate act rather than a deadline.
