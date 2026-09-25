#!/bin/bash
# Stop hook: keeps STATUS.md/ROADMAP.md current when this branch has commits that
# post-date the last STATUS.md refresh. Fires at most once per session
# (session-scoped marker in /tmp) so it doesn't nag on every turn.
#
# It used to tell the USER to run /wrap. That moved the forgetting one step along
# rather than fixing it: the nudge lands at the end of a session, which is exactly
# when nobody wants to type another command, so sessions ended unwrapped anyway and
# STATUS.md drifted. It now instructs the session to do the update itself and stop.
#
# Deliberately bounded, because this is the one place the agent writes without being
# asked (see .claude/CLAUDE.md, "Do not make secretive changes" and its one named
# exception): only STATUS.md and ROADMAP.md, only a commit on a feature branch (then
# pushed), and announced in the session's final message. On main or dev the files are
# updated but NOT committed — those branches take changes through a PR, and a hook is
# not a PR.
#
# The feature-branch commit is pushed because a local-only refresh helps nobody: the
# next session branches off dev, which never sees it, and the branch is deleted after
# merge. Pushed, it rides the branch's PR to dev like any other commit.

input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
[ -z "$session_id" ] && session_id="unknown"
marker="/tmp/.claude-wrap-nudge-${session_id}"

[ -f "$marker" ] && exit 0

repo_root=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$repo_root" ] && exit 0
cd "$repo_root" 2>/dev/null || exit 0
[ -f STATUS.md ] || exit 0

last_wrap_commit=$(git log -1 --format=%H -- STATUS.md 2>/dev/null)

if [ -z "$last_wrap_commit" ]; then
  range="HEAD"
else
  range="${last_wrap_commit}..HEAD"
fi

new_commits=$(git rev-list "$range" -- . ':!STATUS.md' ':!ROADMAP.md' 2>/dev/null | wc -l | tr -d ' ')
[ -z "$new_commits" ] && new_commits=0

if [ "$new_commits" -gt 0 ] 2>/dev/null; then
  touch "$marker" 2>/dev/null

  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

  # The commit subjects are what the update is derived from, so hand them over rather
  # than leave them to be re-derived with another git call. Capped: a long-running
  # branch should not paste eighty lines into the stop reason.
  subjects=$(git log --no-merges --format='  - %s' "$range" -- . ':!STATUS.md' ':!ROADMAP.md' 2>/dev/null | head -20)

  case "$branch" in
    main|dev)
      commit_rule='Do NOT commit — this branch takes changes through a PR, and a hook is not a PR. Leave the edits in the working tree and say so.'
      ;;
    *)
      commit_rule='Then commit ONLY those two files, with the message `chore: refresh status`. Do not stage anything else. Then push the branch (`git push`, or `git push -u origin '"${branch}"'` if it has no upstream yet), so the refresh travels with its PR rather than staying local.'
      ;;
  esac

  reason="Before stopping, update STATUS.md and ROADMAP.md yourself so the next session starts from an accurate picture. Do not ask first — this is the one update expected to happen unprompted.

${new_commits} commit(s) on '${branch}' post-date the last STATUS.md refresh:
${subjects}

1. ROADMAP.md — tick '- [x]' only what actually shipped (merged or released); work in flight stays unchecked. Add new in-scope work as '- [ ]' under an existing phase.
2. STATUS.md — refresh the version/stage line and the _Updated:_ date, rewrite Now to the current state of play, replace Next with the 2-3 things that matter next, update Blockers.
3. ${commit_rule}
4. Say in one line what you changed, so it is visible rather than silent.

Touch no other file. If both files are already accurate for these commits, say so and stop without editing."

  jq -n --arg reason "$reason" '{decision:"block", reason:$reason}'
fi
