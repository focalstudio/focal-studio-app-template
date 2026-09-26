# Parking lot

> Findings spotted mid-session and **deliberately not fixed there**. The rule and the entry
> format are in [AGENTS.md](AGENTS.md), under "One issue per session — the parking lot".
> Append-only. Triaged at each release cut: every entry is filed as an issue (labelled `parked`)
> or dropped with a reason, then moved to `## Triaged`.

## Parked

- [ ] 2026-09-25 · found while on #176 · .github/workflows/cross-repo-report.yml:89 · `drift-report.sh` exits 1 in ~1s on the ubuntu runner, on both `dev` (run 36153706977) and #191 (run 36153215129), while the same branch exits 0 locally with no credential helper; output is hidden by design, #175's stage line now says **`compare:focalstudio/tick`** (run 36244777904, 2026-09-26): the clone succeeds and `compare()` dies on the first app, and mealcart/WildFocus/vestia are never reached · high
- [ ] 2026-09-26 · found while on #177 · scripts/install-fleet-agent.sh:288 · the direct-mode fallback treats any non-zero probe exit as a macOS denial: a `gh`/network failure or a `fleet-report.sh` error during the probe prints "Denied by macOS (exit 1)" and needlessly installs copy mode. Only 126 or "Operation not permitted" in the log is a real denial; any other code should surface the log line and stop. Not in #187 batch A · low

## Triaged
